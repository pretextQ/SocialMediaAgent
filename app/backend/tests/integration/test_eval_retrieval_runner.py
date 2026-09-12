"""RAG 检索质量 runner 集成测试（TDD，P6）。

覆盖：加载用例、对**真实 seed 知识库**跑检索评分、汇总与 Markdown 渲染。
默认 HashEmbedder 是确定性的，因此本组测试**不需要 LLM 密钥**。
"""

import json

from socialmedia_agent.evaluation.retrieval_runner import (
    build_seed_retriever,
    load_cases,
    render_markdown,
    run_suite,
)
from socialmedia_agent.evaluation.models import RetrievalCase

SEED_KNOWLEDGE = "seed/knowledge.md"


def test_load_cases_reads_json(tmp_path):
    path = tmp_path / "cases.json"
    path.write_text(json.dumps([
        {"id": "c1", "query": "标题怎么写", "expected_ids": ["标题写作方法"], "note": "标注"}
    ], ensure_ascii=False), encoding="utf-8")

    cases = load_cases(path)

    assert len(cases) == 1
    assert cases[0].id == "c1"
    assert cases[0].query == "标题怎么写"
    assert cases[0].expected_ids == ["标题写作方法"]
    assert cases[0].note == "标注"


def test_run_suite_scores_seeded_knowledge():
    """用 seed 文档原题作为查询，top-k 内应当命中（精确匹配，不依赖语义）。"""
    retriever = build_seed_retriever(SEED_KNOWLEDGE)
    cases = [RetrievalCase(id="c1", query="标题写作方法", expected_ids=["标题写作方法"])]

    report = run_suite(cases, retriever, k=3)

    assert report.summary.case_count == 1
    assert report.summary.k == 3
    assert report.outcomes[0].score.hit is True
    assert report.summary.hit_rate == 1.0


def test_run_suite_reports_miss_as_zero():
    retriever = build_seed_retriever(SEED_KNOWLEDGE)
    cases = [RetrievalCase(id="c1", query="完全不存在的主题 zzzz", expected_ids=["不存在的文档"])]

    report = run_suite(cases, retriever, k=3)

    assert report.summary.hit_rate == 0.0
    assert report.summary.mrr == 0.0


def test_render_markdown_reports_metrics():
    retriever = build_seed_retriever(SEED_KNOWLEDGE)
    cases = [RetrievalCase(id="c1", query="标题写作方法", expected_ids=["标题写作方法"])]

    md = render_markdown(run_suite(cases, retriever, k=3))

    assert "检索" in md
    assert "recall" in md.lower()
    assert "MRR" in md
