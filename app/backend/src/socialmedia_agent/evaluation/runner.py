"""评测运行器（M3）。

回答两个问题：
1. 模型选对工具了吗？（recall / precision / f1 / exact_match / 重复调用）
2. 换成 agentic 之后，比确定性路径好还是差？（同批用例、两种模式对照）

两种模式都会用 RecordingRegistry **实测**实际调用序列，而不是引用手写常量。

`runs>1` 时同一用例重复多轮：先按轮聚合，再跨轮给出均值与总体标准差
（LLM 温度 > 0，单轮结果不足以作为结论）。
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from dataclasses import dataclass
from pathlib import Path

from socialmedia_agent.agents.account_strategy.agentic import gather_agentic
from socialmedia_agent.agents.account_strategy.nodes import gather as deterministic_gather
from socialmedia_agent.agents.tools.catalog import build_registry
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.database.session import Database
from socialmedia_agent.llm.factory import build_gateway
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.memory.store import build_memory_store
from socialmedia_agent.memory.summarizer import Summarizer

from .models import CaseOutcome, EvalCase, EvalReport, ModeSummary
from .recording import RecordingRegistry
from .tool_selection import score_tool_selection

DEFAULT_MODES = ("rules", "llm")
# 评测 CLI 默认重复轮次：LLM 温度 > 0，单次运行不足以作为结论
DEFAULT_RUNS = 3


def load_cases(path: str | Path) -> list[EvalCase]:
    """从 JSON 文件读取评测用例。"""
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return [
        EvalCase(
            id=item["id"],
            account_id=item["account_id"],
            expected_tools=list(item["expected_tools"]),
            note=item.get("note", ""),
        )
        for item in raw
    ]


def run_case(
    case: EvalCase,
    registry: ToolRegistry,
    gateway: LLMGateway | None,
    mode: str,
    run_index: int = 0,
) -> CaseOutcome:
    """在指定模式下跑一个用例，返回实测工具序列与评分。

    只测量 **gather 阶段**：图里的 persist 节点会调用 save_operation_memory，
    那属于「写记忆」而不是「取数决策」，不应计入工具选择质量。
    """
    recording = RecordingRegistry(registry)

    if mode == "llm":
        result = gather_agentic(recording, gateway, case.account_id)
        source = result.source
    else:
        deterministic_gather(recording, case.account_id)
        source = "rules"

    actual = list(recording.calls)
    return CaseOutcome(
        case_id=case.id,
        mode=mode,
        source=source,
        tool_trace=actual,
        score=score_tool_selection(set(case.expected_tools), actual),
        run_index=run_index,
    )


@dataclass
class _RunMetrics:
    """单轮聚合：该轮内所有用例的均值。"""

    recall: float
    precision: float
    f1: float
    exact_match_rate: float
    duplicate_calls: float


def _run_metrics(rows: list[CaseOutcome]) -> _RunMetrics | None:
    if not rows:
        return None
    n = len(rows)
    return _RunMetrics(
        recall=sum(o.score.recall for o in rows) / n,
        precision=sum(o.score.precision for o in rows) / n,
        f1=sum(o.score.f1 for o in rows) / n,
        exact_match_rate=sum(1 for o in rows if o.score.exact_match) / n,
        duplicate_calls=sum(o.score.duplicate_calls for o in rows) / n,
    )


def _mean_std(values: list[float]) -> tuple[float, float]:
    """均值与**总体**标准差；单轮时 std 为 0.0（报告必须同时给出轮次）。"""
    if not values:
        return 0.0, 0.0
    return sum(values) / len(values), statistics.pstdev(values)


def _summarize(outcomes: list[CaseOutcome], modes: tuple[str, ...]) -> list[ModeSummary]:
    """先按轮聚合，再跨轮求均值/方差 —— 不把「轮内差异」与「轮间波动」混为一谈。"""
    summaries: list[ModeSummary] = []
    for mode in modes:
        rows = [o for o in outcomes if o.mode == mode]
        if not rows:
            continue
        run_count = max(o.run_index for o in rows) + 1
        per_run = [
            m
            for m in (
                _run_metrics([o for o in rows if o.run_index == r])
                for r in range(run_count)
            )
            if m is not None
        ]
        if not per_run:
            continue
        mean_recall, std_recall = _mean_std([m.recall for m in per_run])
        mean_precision, std_precision = _mean_std([m.precision for m in per_run])
        mean_f1, std_f1 = _mean_std([m.f1 for m in per_run])
        mean_exact, std_exact = _mean_std([m.exact_match_rate for m in per_run])
        mean_dup, std_dup = _mean_std([m.duplicate_calls for m in per_run])
        summaries.append(
            ModeSummary(
                mode=mode,
                case_count=len({o.case_id for o in rows}),
                runs=len(per_run),
                mean_recall=mean_recall,
                std_recall=std_recall,
                mean_precision=mean_precision,
                std_precision=std_precision,
                mean_f1=mean_f1,
                std_f1=std_f1,
                mean_exact_match_rate=mean_exact,
                std_exact_match_rate=std_exact,
                mean_duplicate_calls=mean_dup,
                std_duplicate_calls=std_dup,
                total_duplicate_calls=sum(o.score.duplicate_calls for o in rows),
            )
        )
    return summaries


def run_suite(
    cases: list[EvalCase],
    registry: ToolRegistry,
    gateway: LLMGateway | None,
    modes: tuple[str, ...] = DEFAULT_MODES,
    runs: int = 1,
) -> EvalReport:
    """跑完整评测集：每个模式各跑 **runs 轮** 所有用例。

    库层默认 1 轮（保持调用成本可预期）；「多次重复取均值并报告方差」的策略
    由评测 CLI 承担（--runs，默认 DEFAULT_RUNS）。
    """
    if runs < 1:
        raise ValueError("runs 必须 >= 1")
    outcomes = [
        run_case(case, registry, gateway, mode, run_index=run_index)
        for run_index in range(runs)
        for mode in modes
        for case in cases
    ]
    return EvalReport(outcomes=outcomes, summaries=_summarize(outcomes, modes))


def render_markdown(report: EvalReport) -> str:
    """把评测报告渲染为 Markdown。"""
    lines = [
        "# 工具选择评测报告",
        "",
        "> recall = 命中期望工具 / 期望工具数；precision = 命中 / 实际去重后工具数；",
        "> 重复调用 = 实际调用次数 - 去重后数量。",
        "> 多轮（--runs>1）：先按轮对各用例求均值，再跨轮给出 **均值 ± 总体标准差**；",
        "> 单轮时标准差恒为 0，请以「轮次」列为准，不要当成「结论稳定」。",
        "",
        "## 汇总",
        "",
        "| 模式 | 用例数 | 轮次 | recall | precision | f1 | 完全匹配率 | 重复调用 |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for summary in report.summaries:
        lines.append(
            f"| {summary.mode} | {summary.case_count} | {summary.runs} | "
            f"{summary.mean_recall:.3f} ± {summary.std_recall:.3f} | "
            f"{summary.mean_precision:.3f} ± {summary.std_precision:.3f} | "
            f"{summary.mean_f1:.3f} ± {summary.std_f1:.3f} | "
            f"{summary.mean_exact_match_rate:.0%} ± {summary.std_exact_match_rate:.0%} | "
            f"{summary.mean_duplicate_calls:.2f} ± {summary.std_duplicate_calls:.2f} |"
        )

    lines += [
        "",
        "## 逐用例明细（每轮原始观测）",
        "",
        "| 用例 | 轮次 | 模式 | source | 实际工具 | 漏调 | 多调 | 重复 |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for outcome in report.outcomes:
        lines.append(
            f"| {outcome.case_id} | {outcome.run_index + 1} | {outcome.mode} | {outcome.source} | "
            f"{', '.join(outcome.tool_trace)} | "
            f"{', '.join(outcome.score.missing) or '-'} | "
            f"{', '.join(outcome.score.unexpected) or '-'} | "
            f"{outcome.score.duplicate_calls} |"
        )
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="evaluation", description="工具选择质量评测")
    parser.add_argument("--cases", required=True, help="用例 JSON 路径")
    parser.add_argument("--db-url", default=None, help="覆盖数据库 URL")
    parser.add_argument("--memory-url", default=None, help="覆盖 Memory 数据库 URL")
    parser.add_argument("--modes", default=",".join(DEFAULT_MODES), help="逗号分隔的模式")
    parser.add_argument(
        "--runs",
        type=int,
        default=DEFAULT_RUNS,
        help=f"每个用例重复轮次（默认 {DEFAULT_RUNS}；LLM 有随机性，单轮不足以作为结论）",
    )
    parser.add_argument("--report", default=None, help="输出 Markdown 报告路径")
    parser.add_argument("--dry-run", action="store_true", help="只读用例并校验，不调用模型")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    cases = load_cases(args.cases)
    if not cases:
        print(f"[evaluation] 用例为空: {args.cases}", file=sys.stderr)
        return 1

    if args.dry_run:
        print(f"[evaluation] 校验通过（dry-run，未调用模型）：{len(cases)} 个用例")
        return 0

    database = Database(url=args.db_url)
    memory = build_memory_store(args.memory_url)
    registry = build_registry(
        database, retriever=None, memory_store=memory, summarizer=Summarizer()
    )
    gateway = build_gateway()
    print(f"[evaluation] gateway: {'真实 LLM' if gateway else 'None（规则兜底）'}")

    if args.runs < 1:
        print("[evaluation] --runs 必须 >= 1", file=sys.stderr)
        return 1

    modes = tuple(m.strip() for m in args.modes.split(",") if m.strip())
    print(f"[evaluation] modes={','.join(modes)} runs={args.runs}")
    report = run_suite(cases, registry, gateway, modes=modes, runs=args.runs)
    markdown = render_markdown(report)

    if args.report:
        Path(args.report).write_text(markdown, encoding="utf-8")
        print(f"[evaluation] 报告已写入 {args.report}")
    else:
        print(markdown)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
