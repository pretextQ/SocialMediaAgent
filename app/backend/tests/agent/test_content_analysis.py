"""Content Analysis Agent 测试（TDD，P4-1）。

覆盖：
- ContentAnalysisOutput 严格 schema（content_id/quality_score 必填，0-100）
- 端到端：content_id → gather 取数 → LLM 结构化输出 → 人类报告
- LLM 失败/非法输出 → 规则兜底仍满足 schema
- 统计数字核验：LLM prompt 包含 DB 事实（指标值 / 账号均值）
- 规则兜底确定性：quality_score 由指标 vs 账号均值计算
- 人类报告非空
"""

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import sessionmaker

from socialmedia_agent.agents.content_analysis.graph import build_content_analysis_graph
from socialmedia_agent.agents.content_analysis.schemas import ContentAnalysisOutput
from socialmedia_agent.database.engine import create_db_engine
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, MetricSource, MetricType, Platform
from socialmedia_agent.domain.metric import Metric
from socialmedia_agent.llm.circuit_breaker import CircuitBreaker
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.llm.providers import LLMProvider
from socialmedia_agent.memory.store import SQLAlchemyMemoryStore
from socialmedia_agent.memory.summarizer import Summarizer
from socialmedia_agent.rag import HashEmbedder, InMemoryVectorStore, Retriever
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.metric_repo import MetricRepository


def seed_db(tmp_path) -> Database:
    db = Database(url=f"sqlite:///{tmp_path / 'ca.db'}")
    db.create_all()
    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="90001", nickname="UP主A")
        )
        c1 = ContentRepository(session).upsert(
            Content(
                platform=Platform.BILIBILI,
                platform_content_id="1001",
                account_id="bilibili:90001",
                title="人工智能入门",
                content="本文介绍人工智能基础概念。",
                content_type=ContentType.VIDEO,
            )
        )
        c2 = ContentRepository(session).upsert(
            Content(
                platform=Platform.BILIBILI,
                platform_content_id="1002",
                account_id="bilibili:90001",
                title="AI 绘画教程",
                content_type=ContentType.VIDEO,
            )
        )
        for cid, metric_type, value in (
            (c1.canonical_id, MetricType.VIEWS, "1000"),
            (c1.canonical_id, MetricType.LIKES, "50"),
            (c1.canonical_id, MetricType.COMMENTS, "10"),
            (c2.canonical_id, MetricType.VIEWS, "500"),
        ):
            MetricRepository(session).upsert(
                Metric(
                    content_id=cid,
                    account_id="bilibili:90001",
                    platform=Platform.BILIBILI,
                    metric_type=metric_type,
                    value=value,
                    captured_at="2026-08-24T10:00:00Z",
                    source=MetricSource.MEDIACRAWLER,
                )
            )
    return db


def make_context(tmp_path):
    from socialmedia_agent.agents.tools.base import ToolContext
    from socialmedia_agent.agents.tools.catalog import build_core_tools
    from socialmedia_agent.agents.tools.registry import ToolRegistry

    db = seed_db(tmp_path)

    store = InMemoryVectorStore()
    emb = HashEmbedder(dim=64)
    store.add(
        emb.embed_texts(["内容质量评估方法：播放量、点赞率、评论数综合判断"]),
        [{"title": "质量评估", "content": "内容质量评估方法"}],
        ids=["k1"],
    )

    m_engine = create_db_engine(f"sqlite:///{tmp_path / 'mem.db'}")
    SQLAlchemyMemoryStore.create_all(m_engine)
    m_session = sessionmaker(bind=m_engine, expire_on_commit=False)()

    ctx = ToolContext(
        database=db,
        retriever=Retriever(embedder=emb, store=store),
        memory_store=SQLAlchemyMemoryStore(m_session),
        summarizer=Summarizer(),
    )
    reg = ToolRegistry()
    for tool in build_core_tools(ctx):
        reg.register(tool)
    return ctx, reg, db


class ScriptedProvider(LLMProvider):
    def __init__(self, script: list[str]) -> None:
        self.script = script
        self.last_user_content: str | None = None

    def complete(self, messages: list[dict], response_format: str = "text") -> str:
        self.last_user_content = messages[-1]["content"]
        return self.script.pop(0)


def make_gateway(provider: LLMProvider) -> LLMGateway:
    return LLMGateway(
        provider=provider,
        breaker=CircuitBreaker(name="ca", failure_threshold=3, recovery_timeout=60),
    )


def test_content_analysis_output_schema_strict():
    out = ContentAnalysisOutput(
        content_id="bilibili:1001",
        title="人工智能入门",
        summary="质量良好",
        quality_score=90,
        strengths=["播放量高于均值"],
        weaknesses=[],
        suggestions=[],
    )
    assert 0 <= out.quality_score <= 100
    assert isinstance(out.strengths, list)

    with pytest.raises(ValidationError):
        ContentAnalysisOutput(content_id="x", quality_score=120)
    with pytest.raises(ValidationError):
        ContentAnalysisOutput(quality_score=50)  # content_id 必填


def test_content_analysis_end_to_end(tmp_path):
    ctx, reg, db = make_context(tmp_path)
    provider = ScriptedProvider(
        [
            '{"content_id": "bilibili:1001", "title": "人工智能入门", "summary": "内容质量良好", '
            '"quality_score": 88, "strengths": ["播放量高于账号均值"], "weaknesses": ["点赞率偏低"], '
            '"suggestions": ["优化开头钩子"]}'
        ]
    )
    graph = build_content_analysis_graph(registry=reg, gateway=make_gateway(provider))
    state = graph.invoke({"content_id": "bilibili:1001"})
    assert isinstance(state["analysis"], ContentAnalysisOutput)
    assert state["analysis"].quality_score == 88
    assert state["analysis"].strengths == ["播放量高于账号均值"]
    assert state["report"]
    assert "人工智能入门" in state["report"]


def test_statistics_injected_into_prompt(tmp_path):
    """指标值（1000/50/10）与账号聚合（1500/2）必须注入 LLM prompt。"""
    ctx, reg, db = make_context(tmp_path)
    provider = ScriptedProvider(
        [
            '{"content_id": "bilibili:1001", "quality_score": 60, '
            '"strengths": [], "weaknesses": [], "suggestions": []}'
        ]
    )
    graph = build_content_analysis_graph(registry=reg, gateway=make_gateway(provider))
    graph.invoke({"content_id": "bilibili:1001"})
    assert "1000" in provider.last_user_content
    assert "1500" in provider.last_user_content


def test_llm_failure_falls_back_to_rules(tmp_path):
    ctx, reg, db = make_context(tmp_path)
    provider = ScriptedProvider(["not-json"])
    graph = build_content_analysis_graph(registry=reg, gateway=make_gateway(provider))
    state = graph.invoke({"content_id": "bilibili:1001"})
    assert isinstance(state["analysis"], ContentAnalysisOutput)
    assert 0 <= state["analysis"].quality_score <= 100
    assert state["report"]


def test_rule_fallback_deterministic_score(tmp_path):
    """gateway=None 时规则兜底：c1 播放量(1000) >= 账号均值(750) → 加分；
    c2 播放量(500) < 均值 → 扣分，分数可核验。"""
    ctx, reg, db = make_context(tmp_path)
    graph = build_content_analysis_graph(registry=reg, gateway=None)
    state1 = graph.invoke({"content_id": "bilibili:1001"})
    state2 = graph.invoke({"content_id": "bilibili:1002"})
    assert state1["analysis"].quality_score > state2["analysis"].quality_score
    assert state1["analysis"].quality_score >= 70
    assert state2["analysis"].quality_score <= 50
    assert any("均值" in s for s in state1["analysis"].strengths)
    assert any("均值" in w for w in state2["analysis"].weaknesses)


def test_report_mentions_structured_fields(tmp_path):
    ctx, reg, db = make_context(tmp_path)
    provider = ScriptedProvider(
        [
            '{"content_id": "bilibili:1001", "title": "人工智能入门", "summary": "整体优秀", '
            '"quality_score": 90, "strengths": ["播放量高于均值"], "weaknesses": ["互动不足"], '
            '"suggestions": ["增加引导评论"]}'
        ]
    )
    graph = build_content_analysis_graph(registry=reg, gateway=make_gateway(provider))
    state = graph.invoke({"content_id": "bilibili:1001"})
    report = state["report"]
    assert "90" in report
    assert "播放量高于均值" in report
    assert "增加引导评论" in report
