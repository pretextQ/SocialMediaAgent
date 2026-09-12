"""数据准确性 runner（P6）：报告中的数字是否都有出处。

对每个用例跑**真实 Agent**（account_strategy / content_analysis），拿到 facts 与 report，
再按「事实性大数字是否能在 facts 中找到」打分。

**为什么要在 LLM 路径上测**：规则兜底路径的输出完全由 facts 生成，天然不会有编造——
只有 LLM 路径上「数字是否忠实于事实」才是个真问题。

用法：
    python -m socialmedia_agent.evaluation.grounding_runner --cases <cases.json> --db-url <url>
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

from socialmedia_agent.agents.tools.catalog import build_registry
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.database.session import Database
from socialmedia_agent.llm.factory import build_gateway
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.memory.store import build_memory_store
from socialmedia_agent.memory.summarizer import Summarizer

from .agent_output import run_agent_output
from .grounding import score_grounding
from .models import GroundingCase, GroundingOutcome, GroundingReport

# grounding 依赖 LLM 输出，温度 > 0 时单轮不足以作为结论
DEFAULT_RUNS = 3


def load_cases(path: str | Path) -> list[GroundingCase]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return [
        GroundingCase(
            id=item["id"],
            kind=item["kind"],
            target_id=item["target_id"],
            note=item.get("note", ""),
        )
        for item in raw
    ]


def run_case(
    case: GroundingCase,
    registry: ToolRegistry,
    gateway: LLMGateway | None,
    run_index: int = 0,
) -> GroundingOutcome:
    facts, report = run_agent_output(case.kind, case.target_id, registry, gateway)

    return GroundingOutcome(
        case_id=case.id,
        kind=case.kind,
        target_id=case.target_id,
        score=score_grounding(report, facts),
        report=report,
        run_index=run_index,
    )


def run_suite(
    cases: list[GroundingCase],
    registry: ToolRegistry,
    gateway: LLMGateway | None,
    runs: int = 1,
) -> GroundingReport:
    """每个用例重复 `runs` 轮：先按轮对各用例求均值，再跨轮给出均值与总体标准差。"""
    if runs < 1:
        raise ValueError("runs 必须 >= 1")
    outcomes = [
        run_case(case, registry, gateway, run_index=run_index)
        for run_index in range(runs)
        for case in cases
    ]
    per_run: list[float] = []
    for run_index in range(runs):
        rows = [o for o in outcomes if o.run_index == run_index]
        if rows:
            per_run.append(sum(o.score.grounded_rate for o in rows) / len(rows))

    return GroundingReport(
        outcomes=outcomes,
        case_count=len({o.case_id for o in outcomes}),
        runs=len(per_run),
        number_count=sum(len(o.score.report_numbers) for o in outcomes),
        ungrounded_count=sum(len(o.score.ungrounded) for o in outcomes),
        mean_grounded_rate=(sum(per_run) / len(per_run)) if per_run else 0.0,
        std_grounded_rate=statistics.pstdev(per_run) if per_run else 0.0,
    )


def render_markdown(report: GroundingReport) -> str:
    lines = [
        "# 数据准确性报告（数字是否有出处）",
        "",
        "> 事实性大数字 = 报告中 **≥1000 的整数**（排除 KPI 小节——KPI 是目标值，不是事实）。",
        "> grounded = 该数字能在序列化后的 facts 中找到出处。",
        "> **局限**：抓不到编造的小数字；也不能判断「数字被安在了正确的指标上」。",
        "",
        "## 汇总",
        "",
        "| 用例数 | 轮次 | 事实性数字 | 无出处数字 | grounded 率（均值 ± 总体标准差） |",
        "| --- | --- | --- | --- | --- |",
        f"| {report.case_count} | {report.runs} | {report.number_count} | "
        f"{report.ungrounded_count} | {report.mean_grounded_rate:.0%} ± "
        f"{report.std_grounded_rate:.0%} |",
        "",
        "## 逐用例明细（每轮原始观测）",
        "",
        "| 用例 | 轮次 | 类型 | 目标 | 数字数 | 无出处数字 | grounded 率 |",
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for outcome in report.outcomes:
        ungrounded = ", ".join(outcome.score.ungrounded) or "-"
        lines.append(
            f"| {outcome.case_id} | {outcome.run_index + 1} | {outcome.kind} | "
            f"{outcome.target_id} | {len(outcome.score.report_numbers)} | {ungrounded} | "
            f"{outcome.score.grounded_rate:.0%} |"
        )
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="grounding-eval", description="数据准确性评测")
    parser.add_argument("--cases", required=True, help="用例 JSON 路径")
    parser.add_argument("--db-url", default=None, help="覆盖数据库 URL")
    parser.add_argument("--memory-url", default=None, help="覆盖 Memory 数据库 URL")
    parser.add_argument(
        "--runs",
        type=int,
        default=DEFAULT_RUNS,
        help=f"每个用例重复轮次（默认 {DEFAULT_RUNS}；LLM 温度 > 0，单轮不足以作为结论）",
    )
    parser.add_argument("--report", default=None, help="输出 Markdown 报告路径")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    cases = load_cases(args.cases)
    if not cases:
        print(f"[grounding-eval] 用例为空: {args.cases}", file=sys.stderr)
        return 1

    database = Database(url=args.db_url)
    memory = build_memory_store(args.memory_url)
    registry = build_registry(
        database, retriever=None, memory_store=memory, summarizer=Summarizer()
    )
    gateway = build_gateway()
    print(
        "[grounding-eval] gateway: "
        + ("真实 LLM" if gateway else "None（规则兜底路径不会有编造）")
    )

    if args.runs < 1:
        print("[grounding-eval] --runs 必须 >= 1", file=sys.stderr)
        return 1

    markdown = render_markdown(run_suite(cases, registry, gateway, runs=args.runs))
    if args.report:
        Path(args.report).write_text(markdown, encoding="utf-8")
        print(f"[grounding-eval] 报告已写入 {args.report}")
    else:
        print(markdown)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
