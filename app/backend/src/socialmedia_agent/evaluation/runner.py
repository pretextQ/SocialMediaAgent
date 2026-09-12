"""评测运行器（M3）。

回答两个问题：
1. 模型选对工具了吗？（recall / precision / f1 / exact_match / 重复调用）
2. 换成 agentic 之后，比确定性路径好还是差？（同批用例、两种模式对照）

两种模式都会用 RecordingRegistry **实测**实际调用序列，而不是引用手写常量。
"""

from __future__ import annotations

import argparse
import json
import sys
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
    )


def _summarize(outcomes: list[CaseOutcome], modes: tuple[str, ...]) -> list[ModeSummary]:
    summaries: list[ModeSummary] = []
    for mode in modes:
        rows = [o for o in outcomes if o.mode == mode]
        if not rows:
            continue
        count = len(rows)
        summaries.append(
            ModeSummary(
                mode=mode,
                case_count=count,
                mean_recall=sum(o.score.recall for o in rows) / count,
                mean_precision=sum(o.score.precision for o in rows) / count,
                mean_f1=sum(o.score.f1 for o in rows) / count,
                exact_match_rate=sum(1 for o in rows if o.score.exact_match) / count,
                total_duplicate_calls=sum(o.score.duplicate_calls for o in rows),
            )
        )
    return summaries


def run_suite(
    cases: list[EvalCase],
    registry: ToolRegistry,
    gateway: LLMGateway | None,
    modes: tuple[str, ...] = DEFAULT_MODES,
) -> EvalReport:
    """跑完整评测集（每个模式各跑一遍所有用例）。"""
    outcomes = [
        run_case(case, registry, gateway, mode) for mode in modes for case in cases
    ]
    return EvalReport(outcomes=outcomes, summaries=_summarize(outcomes, modes))


def render_markdown(report: EvalReport) -> str:
    """把评测报告渲染为 Markdown。"""
    lines = [
        "# 工具选择评测报告",
        "",
        "> recall = 命中期望工具 / 期望工具数；precision = 命中 / 实际去重后工具数；",
        "> 重复调用 = 实际调用次数 - 去重后数量。",
        "",
        "## 汇总",
        "",
        "| 模式 | 用例数 | recall | precision | f1 | 完全匹配率 | 重复调用 |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for summary in report.summaries:
        lines.append(
            f"| {summary.mode} | {summary.case_count} | {summary.mean_recall:.3f} | "
            f"{summary.mean_precision:.3f} | {summary.mean_f1:.3f} | "
            f"{summary.exact_match_rate:.0%} | {summary.total_duplicate_calls} |"
        )

    lines += [
        "",
        "## 逐用例明细",
        "",
        "| 用例 | 模式 | source | 实际工具 | 漏调 | 多调 | 重复 |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for outcome in report.outcomes:
        lines.append(
            f"| {outcome.case_id} | {outcome.mode} | {outcome.source} | "
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

    modes = tuple(m.strip() for m in args.modes.split(",") if m.strip())
    report = run_suite(cases, registry, gateway, modes=modes)
    markdown = render_markdown(report)

    if args.report:
        Path(args.report).write_text(markdown, encoding="utf-8")
        print(f"[evaluation] 报告已写入 {args.report}")
    else:
        print(markdown)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
