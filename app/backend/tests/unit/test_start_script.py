"""start.ps1 启动器回归测试。

为什么需要（真实缺陷）：`$env:VITE_API_TARGET` 原先只在「前端需要新启动」的 else 分支里赋值。
于是当 5173 已经被一个「没带 VITE_API_TARGET」的 Vite 占着、或后端端口被复用时，
Vite 会回落到它自己的默认代理目标 `http://127.0.0.1:8000`，而启动器这次的后端其实在别的端口 ——
前端所有 `/api/v1/*` 调用打到一个空端口，页面只剩空壳。

做法：**用 PowerShell 自己的 AST 解析脚本**，断言「导出代理目标」这一步确实发生在「启动 Vite」之前，
并把函数定义体固化成 golden（函数语义变了就报红）。不是字符串匹配 —— AST 看得懂代码结构。

更新 golden（确认改动无误后）：

    $env:UPDATE_GOLDEN = "1"
    .venv/Scripts/python.exe -m pytest tests/unit/test_start_script.py

（更新后请 `git diff` 检查快照差异，再连同代码一起提交。）
"""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[2]
START_PS1 = BACKEND_DIR.parent / "scripts" / "start.ps1"
GOLDEN = Path(__file__).resolve().parents[1] / "golden" / "scripts" / "start.ps1.json"

# 只保留函数定义：preamble 里的 `Resolve-Path` 等顶层语句有副作用，不能执行，
# 但函数体本身是纯文本，抽取后 dot-source 是安全的。
EXTRACT_FUNCTIONS = r"""
$ErrorActionPreference = "Stop"
$path = $env:SMA_SCRIPT_PATH
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) {
    foreach ($e in $errors) { Write-Output ("PARSE-ERROR " + $e.Extent.StartLineNumber + ": " + $e.Message) }
    exit 1
}
$lines = Get-Content -LiteralPath $path -Encoding UTF8
$fns = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)
foreach ($f in $fns) {
    $start = $f.Extent.StartLineNumber; $end = $f.Extent.EndLineNumber
    # 只留函数名与函数体，不留行号：挪动位置不该让快照报警，改语义才该
    Write-Output ("### FUNCTION " + $f.Name)
    $lines[($start - 1)..($end - 1)] | ForEach-Object { Write-Output $_ }
}
"""

# 输出**顶层语句**摘要（JSON）：顺序与位置都要，函数内部的语句不算。
# 注意 PS 5.1 的 AST 形态：顶层语句的 Parent 是 NamedBlockAst，不是 ScriptBlockAst
# （`$ast.EndBlock.Statements` 在 5.1 下恒为空 —— 踩过这个坑）。所以判据是
# 「Parent 是 NamedBlockAst，且该 NamedBlockAst 的 Parent 就是本脚本的 ScriptBlockAst」。
# 这样一条 `if (...) { ... }` 整体只算一条，它内部的赋值不会被误当成顶层语句。
# 函数定义体换成一个占位符 —— 它的内容由 EXTRACT_FUNCTIONS 的 golden 负责。
EXTRACT_TOP_LEVEL = r"""
$path = $env:SMA_SCRIPT_PATH
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors)
$items = @()
$all = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.StatementAst] }, $true)
foreach ($st in $all) {
    $parent = $st.Parent
    if ($parent -isnot [System.Management.Automation.Language.NamedBlockAst]) { continue }
    if (-not [object]::ReferenceEquals($parent.Parent, $ast)) { continue }
    $kind = $st.GetType().Name
    if ($kind -eq "FunctionDefinitionAst") {
        # 函数体由 EXTRACT_FUNCTIONS 的 golden 负责，这里只留占位，避免快照重复
        $text = "<function " + $st.Name + ">"
    } else {
        # 完整语句文本：能区分「启动后端的 Start-Process」与「启动前端的 Start-Process」
        $text = $st.Extent.Text
    }
    $items += [pscustomobject]@{ line = $st.Extent.StartLineNumber; kind = $kind; text = $text }
}
@($items) | ConvertTo-Json -Depth 4
"""

# 取某个顶层 `if (<marker>) { ... }` 的**一级子语句**摘要（JSON）。
# 用于断言「赋值在 $BackendOnly 块的一级语句里，而不是内层端口分支里」。
EXTRACT_BLOCK_STATEMENTS = r"""
$path = $env:SMA_SCRIPT_PATH
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors)
$items = @()
$all = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.StatementAst] }, $true)
foreach ($st in $all) {
    $parent = $st.Parent
    if ($parent -isnot [System.Management.Automation.Language.NamedBlockAst]) { continue }
    if (-not [object]::ReferenceEquals($parent.Parent, $ast)) { continue }
    if ($st -isnot [System.Management.Automation.Language.IfStatementAst]) { continue }
    $cond = $st.Clauses[0].Item1.Extent.Text
    if (-not $cond.StartsWith($env:SMA_BLOCK_MARKER)) { continue }
    foreach ($inner in $st.Clauses[0].Item2.Statements) {
        $items += [pscustomobject]@{ line = $inner.Extent.StartLineNumber; text = $inner.Extent.Text }
    }
    break  # 只取第一处匹配（前端启动那一段）
}
@($items) | ConvertTo-Json -Depth 4
"""


def run_ps(script: str, script_path: Path, **extra_env: str) -> str:
    # 路径走环境变量：-Command 模式下 $args 不可靠（实测额外参数不会传进去）。
    env = {**os.environ, "SMA_SCRIPT_PATH": str(script_path), **extra_env}
    proc = subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=120,
        env=env,
    )
    assert proc.returncode == 0, f"powershell 退出码 {proc.returncode}\n{proc.stdout}\n{proc.stderr}"
    assert "PARSE-ERROR" not in proc.stdout, proc.stdout
    return proc.stdout


@pytest.fixture(scope="module")
def top_level() -> list[dict]:
    """脚本的顶层语句序列（AST）：每项含 line / kind / text。"""
    out = run_ps(EXTRACT_TOP_LEVEL, START_PS1)
    statements = json.loads(out)
    assert statements, "AST 未解析出任何顶层语句 —— 提取脚本本身可能失效"
    return statements


def _first_line(text: str) -> str:
    return (text or "").splitlines()[0].strip() if (text or "").strip() else ""


def _line_of_statement_starting_with(top_level: list[dict], prefix: str) -> int | None:
    """顶层语句中，**首行**以 prefix 开头的那条的行号。

    必须比首行而不是「文本包含」：一条 `if (...) { ... }` 整体是一条顶层语句，
    它内部可以含任意赋值 —— 用「包含」匹配会把嵌在条件里的赋值误判成顶层赋值。
    """
    for st in top_level:
        if _first_line(st.get("text")).startswith(prefix):
            return st["line"]
    return None


def _line_of(top_level: list[dict], needle: str) -> int | None:
    """任意位置上第一条「文本含 needle」的顶层语句行号（用于定位 npm run dev）。"""
    for st in top_level:
        if needle in (st.get("text") or ""):
            return st["line"]
    return None


def test_script_parses_without_syntax_errors():
    """PowerShell 必须能无错解析 start.ps1（PS 5.1 最容易死在编码与引号上）。"""
    run_ps(EXTRACT_FUNCTIONS, START_PS1)


# `if (-not $BackendOnly) { ... }` 是**两处**（前端启动与汇总打印），取第一处的
# 一级子语句；两处都取的话断言会因为混入汇总行而失去区分度。
def test_proxy_target_is_an_unconditional_top_level_assignment(top_level):
    """**核心回归**：导出代理目标必须是无条件顶层语句，不能被任何分支跳过。

    缺陷形态：它原先在 `if (-not $BackendOnly) { ... if (Test-PortListening $FrontendPort)
    { } else { 赋值在这里 } }` 的嵌套分支里。于是只有「前端需要新启动」时才会导出；
    一旦 5173 被复用，Vite 就回落到自己的 8000 默认值，前端 /api 全部打空。
    """
    target = _line_of_statement_starting_with(top_level, "$env:VITE_API_TARGET")
    assert target is not None, (
        "$env:VITE_API_TARGET 不是顶层语句 —— 它又被塞进某个 if/else 分支里了："
        "5173 被复用时 Vite 会连到错误的端口，页面取不到数据")


def test_proxy_target_is_resolved_before_vite_is_launched(top_level):
    """导出 VITE_API_TARGET 必须先于启动 Vite。"""
    target_line = _line_of_statement_starting_with(top_level, "$env:VITE_API_TARGET")
    vite_line = _line_of(top_level, "npm run dev")
    assert target_line is not None, "顶层语句里找不到 VITE_API_TARGET 赋值"
    assert vite_line is not None, "顶层语句里找不到启动 Vite 的 npm run dev"
    assert target_line < vite_line, (
        f"导出 VITE_API_TARGET（第 {target_line} 行）必须早于启动 Vite（第 {vite_line} 行）："
        "否则 Vite 会回落到它自己的 8000 默认值，前端 API 全部打空。")


def test_resolve_vite_api_target_prefers_explicit_override_when_called():
    """真实调用 Resolve-ViteApiTarget：显式传入优先，否则按端口拼接。

    函数定义从脚本 AST 里抽出来 dot-source —— 只跑函数体，不触发脚本的副作用。
    """
    call = (
        run_ps(EXTRACT_FUNCTIONS, START_PS1)
        + "\n"
        + 'Write-Output (Resolve-ViteApiTarget "http://127.0.0.1:9999" 8001)'
        + "\n"
        + "Write-Output (Resolve-ViteApiTarget '' 8001)"
        + "\n"
        + "Write-Output (Resolve-ViteApiTarget $null 8000)"
    )
    out = run_ps(call, START_PS1)
    lines = [ln.strip() for ln in out.splitlines() if ln.strip()]
    assert lines == [
        "http://127.0.0.1:9999",
        "http://127.0.0.1:8001",
        "http://127.0.0.1:8000",
    ], out


def test_vite_launch_is_conditional_on_frontend_only(top_level):
    """启动 Vite 必须只在非 BackendOnly 时发生（-BackendOnly 不该拉起前端）。"""
    source = START_PS1.read_text(encoding="utf-8")
    vite_line = _line_of(top_level, "npm run dev")
    assert vite_line is not None
    before = source.splitlines()[max(0, vite_line - 25) : vite_line]
    assert any("if (-not $BackendOnly)" in line for line in before), (
        "启动 Vite 之前看不到 `if (-not $BackendOnly)` —— 前端启动条件可能被挪走了")


def test_helper_functions_snapshot_matches_golden():
    """函数定义体 golden 快照：改了启动器函数语义必须显式确认。"""
    current = run_ps(EXTRACT_FUNCTIONS, START_PS1).replace("\r\n", "\n")

    if os.environ.get("UPDATE_GOLDEN") == "1":
        GOLDEN.parent.mkdir(parents=True, exist_ok=True)
        GOLDEN.write_text(current, encoding="utf-8")
        pytest.skip(f"已更新 golden: {GOLDEN.name}")

    assert GOLDEN.exists(), (
        f"缺少 golden 快照 {GOLDEN}。首次建立请跑："
        "$env:UPDATE_GOLDEN=1; pytest tests/unit/test_start_script.py")
    assert current == GOLDEN.read_text(encoding="utf-8"), (
        f"start.ps1 的函数定义与 golden 不一致（{GOLDEN.name}）。若确认是有意改动，"
        "请更新快照并 review diff：$env:UPDATE_GOLDEN=1; pytest tests/unit/test_start_script.py")
