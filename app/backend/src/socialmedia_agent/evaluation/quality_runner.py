"""输出质量 runner（P6）。

对每个用例跑真实 Agent 生成报告，再让 LLM 评委按固定 rubric 打分；`--runs` 多轮重复以报告方差
（**生成端与评委端都有随机性**）。

**评委分数不是 ground truth**——详见 `evaluation/quality.py` 的说明。

用法：
    python -m socialmedia_agent.evaluation.quality_runner --cases <cases.json> --db-url <url> --runs 3
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
from .models import QualityCase, QualityOutcome, QualityReport
from .quality import judge_quality

DEFAULT_RUNS = 3


def load_cases(path: str | Path) -> list[QualityCase]:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return [
        QualityCase(
            id=item["id"],
            kind=item["kind"],
            target_id=item["target_id"],
            note=item.get("note", ""),
        )
        for item in raw
    ]


def run_case(
    case: QualityCase,
    registry: ToolRegistry,
    gateway: LLMGateway | None,
    run_index: int = 0,
) -> QualityOutcome:
    facts, report = run_agent_output(case.kind, case.target_id, registry, gateway)
    return QualityOutcome(
        case_id=case.id,
        kind=case.kind,
        target_id=case.target_id,
        run_index=run_index,
        judgement=judge_quality(gateway, report, facts),
        report=report,
    )


def run_suite(
    cases: list[QualityCase],
    registry: ToolRegistry,
    gateway: LLMGateway | None,
    runs: int = 1,
) -> QualityReport:
    """每个用例重复 `runs` 轮：先按轮求用例均值，再跨轮给出均值与总体标准差。

    评委调用失败的观测记为 failed，**不计入均值**（不伪造分数）。
    """
    if gateway is None:
        raise ValueError("输出质量评测需要 gateway（评委也是 LLM）；无 gateway 时请勿调用")
    if runs < 1:
        raise ValueError("runs 必须 >= 1")

    outcomes = [
        run_case(case, registry, gateway, run_index=run_index)
        for run_index in range(runs)
        for case in cases
    ]

    per_run: list[float] = []
    for run_index in range(runs):
        judgements = [
            o.judgement
            for o in outcomes
            if o.run_index == run_index and o.judgement is not None
        ]
        if judgements:
            per_run.append(sum(j.overall for j in judgements) / len(judgements))

    return QualityReport(
        outcomes=outcomes,
        case_count=len({o.case_id for o in outcomes}),
        runs=runs,
        judged_count=sum(1 for o in outcomes if o.judgement is not None),
        failed_count=sum(1 for o in outcomes if o.judgement is None),
        mean_overall=(sum(per_run) / len(per_run)) if per_run else 0.0,
        std_overall=statistics.pstdev(per_run) if per_run else 0.0,
    )


def render_markdown(report: QualityReport) -> str:
    lines = [
        "# 输出质量报告（LLM 评委）",
        "",
        "> ⚠️ **评委是 LLM，这份分数不是 ground truth**：只能作相对信号（回归 / 版本对比），",
        "> 不能当绝对质量结论；也存在自偏好（评委可能偏向自己的文风）。",
        "> 维度：specificity 具体性 / structure 结构完整性 / conciseness 简洁性 / overall 总体。",
        "",
        "## 汇总",
        "",
        "| 用例数 | 轮次 | 成功评分 | 失败 | overall（均值 ± 总体标准差） |",
        "| --- | --- | --- | --- | --- |",
        f"| {report.case_count} | {report.runs} | {report.judged_count} | "
        f"{report.failed_count} | {report.mean_overall:.1f} ± {report.std_overall:.1f} |",
        "",
        "## 逐用例明细（每轮原始观测）",
        "",
        "| 用例 | 轮次 | 类型 | 目标 | specificity | structure | conciseness | overall |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for outcome in report.outcomes:
        j = outcome.judgement
        if j is None:
            lines.append(
                f"| {outcome.case_id} | {outcome.run_index + 1} | {outcome.kind} | "
                f"{outcome.target_id} | - | - | - | 评分失败 |"
            )
            continue
        lines.append(
            f"| {outcome.case_id} | {outcome.run_index + 1} | {outcome.kind} | "
            f"{outcome.target_id} | {j.specificity} | {j.structure} | "
            f"{j.conciseness} | {j.overall} |"
        )
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="quality-eval", description="输出质量评测（LLM 评委）")
    parser.add_argument("--cases", required=True, help="用例 JSON 路径")
    parser.add_argument("--db-url", default=None, help="覆盖数据库 URL")
    parser.add_argument("--memory-url", default=None, help="覆盖 Memory 数据库 URL")
    parser.add_argument(
        "--runs",
        type=int,
        default=DEFAULT_RUNS,
        help=f"每个用例重复轮次（默认 {DEFAULT_RUNS}；生成与评委两端都有随机性）",
    )
    parser.add_argument("--report", default=None, help="输出 Markdown 报告路径")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    cases = load_cases(args.cases)
    if not cases:
        print(f"[quality-eval] 用例为空: {args.cases}", file=sys.stderr)
        return 1
    if args.runs < 1:
        print("[quality-eval] --runs 必须 >= 1", file=sys.stderr)
        return 1

    database = Database(url=args.db_url)
    memory = build_memory_store(args.memory_url)
    registry = build_registry(
        database, retriever=None, memory_store=memory, summarizer=Summarizer()
    )
    gateway = build_gateway()
    if gateway is None:
        print(
            "[quality-eval] 未配置 LLM_API_KEY：输出质量评测需要评委，跳过",
            file=sys.stderr,
        )
        return 1
    print("[quality-eval] gateway: 真实 LLM（评委与被测 Agent 同一端点，存在自偏好风险）")

    markdown = render_markdown(run_suite(cases, registry, gateway, runs=args.runs))
    if args.report:
        Path(args.report).write_text(markdown, encoding="utf-8")
        print(f"[quality-eval] 报告已写入 {args.report}")
    else:
        print(markdown)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
