"""RAG 检索质量 runner（P6）。

设计要点：

- 现场从 seed 文档**构建内存知识库**，不依赖 `data/knowledge/*.index` 是否已灌——
  否则「检索质量」测的就成了「你有没有跑过 seed_knowledge」。
- 默认 HashEmbedder 是确定性的（未配置 `SMA_EMBEDDING_MODEL` 时），因此本评测
  **不需要 LLM 密钥**，可以直接作为 CI 的确定性门槛。

用法：
    python -m socialmedia_agent.evaluation.retrieval_runner --cases <cases.json> --k 3
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from socialmedia_agent.config import BACKEND_DIR
from socialmedia_agent.rag.knowledge import build_embedder, load_seed_docs, seed_knowledge
from socialmedia_agent.rag.placeholder import InMemoryVectorStore
from socialmedia_agent.rag.retriever import Retriever

from .models import RetrievalCase, RetrievalOutcome, RetrievalReport, RetrievalSummary
from .retrieval import score_retrieval

DEFAULT_K = 3
DEFAULT_KNOWLEDGE = BACKEND_DIR / "seed" / "knowledge.md"


def load_cases(path: str | Path) -> list[RetrievalCase]:
    """从 JSON 读取检索用例。"""
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    return [
        RetrievalCase(
            id=item["id"],
            query=item["query"],
            expected_ids=list(item["expected_ids"]),
            note=item.get("note", ""),
        )
        for item in raw
    ]


def build_seed_retriever(knowledge_path: str | Path | None = None) -> Retriever:
    """用 seed 文档现场构建内存知识库与检索器（可复现，不依赖已灌的索引文件）。"""
    path = Path(knowledge_path) if knowledge_path else DEFAULT_KNOWLEDGE
    docs = load_seed_docs(path)
    if not docs:
        raise ValueError(f"知识库种子为空或无法解析: {path}")
    embedder = build_embedder()
    store = InMemoryVectorStore()
    seed_knowledge(store, embedder, docs)
    return Retriever(embedder=embedder, store=store)


def run_case(case: RetrievalCase, retriever: Retriever, k: int) -> RetrievalOutcome:
    hits = retriever.retrieve(case.query, top_k=k)
    score = score_retrieval(case.expected_ids, [hit.id for hit in hits], k)
    return RetrievalOutcome(case_id=case.id, query=case.query, score=score)


def run_suite(
    cases: list[RetrievalCase], retriever: Retriever, k: int = DEFAULT_K
) -> RetrievalReport:
    outcomes = [run_case(case, retriever, k) for case in cases]
    divisor = len(outcomes) or 1
    summary = RetrievalSummary(
        case_count=len(outcomes),
        k=k,
        mean_recall_at_k=sum(o.score.recall_at_k for o in outcomes) / divisor,
        mean_precision_at_k=sum(o.score.precision_at_k for o in outcomes) / divisor,
        mrr=sum(o.score.reciprocal_rank for o in outcomes) / divisor,
        hit_rate=sum(1 for o in outcomes if o.score.hit) / divisor,
    )
    return RetrievalReport(outcomes=outcomes, summary=summary)


def render_markdown(report: RetrievalReport) -> str:
    """把检索评测报告渲染为 Markdown。"""
    summary = report.summary
    lines = [
        "# RAG 检索质量报告",
        "",
        "> recall@k = 命中期望文档 / 期望文档数；precision@k = 命中 / **实际返回条数**；",
        "> MRR = 第一个命中文档排名倒数；hit_rate = 至少命中一个的用例占比。",
        "> 本评测现场从 seed 文档构建内存知识库，默认 HashEmbedder（确定性），**不需要 LLM 密钥**。",
        "",
        "## 汇总",
        "",
        "| 用例数 | k | recall@k | precision@k | MRR | hit_rate |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    if summary is not None:
        lines.append(
            f"| {summary.case_count} | {summary.k} | {summary.mean_recall_at_k:.3f} | "
            f"{summary.mean_precision_at_k:.3f} | {summary.mrr:.3f} | {summary.hit_rate:.0%} |"
        )

    lines += [
        "",
        "## 逐用例明细",
        "",
        "| 用例 | 查询 | 期望文档 | 实际 top-k | 命中 | RR |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for outcome in report.outcomes:
        lines.append(
            f"| {outcome.case_id} | {outcome.query} | "
            f"{', '.join(outcome.score.expected)} | "
            f"{', '.join(outcome.score.retrieved) or '-'} | "
            f"{', '.join(outcome.score.hit_ids) or '-'} | "
            f"{outcome.score.reciprocal_rank:.2f} |"
        )
    return "\n".join(lines)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="retrieval-eval", description="RAG 检索质量评测")
    parser.add_argument("--cases", required=True, help="用例 JSON 路径")
    parser.add_argument("--knowledge", default=str(DEFAULT_KNOWLEDGE), help="知识库种子 Markdown")
    parser.add_argument("--k", type=int, default=DEFAULT_K, help="top-k")
    parser.add_argument("--report", default=None, help="输出 Markdown 报告路径")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    cases = load_cases(args.cases)
    if not cases:
        print(f"[retrieval-eval] 用例为空: {args.cases}", file=sys.stderr)
        return 1

    retriever = build_seed_retriever(args.knowledge)
    report = run_suite(cases, retriever, k=args.k)
    markdown = render_markdown(report)

    if args.report:
        Path(args.report).write_text(markdown, encoding="utf-8")
        print(f"[retrieval-eval] 报告已写入 {args.report}")
    else:
        print(markdown)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
