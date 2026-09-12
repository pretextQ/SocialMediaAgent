"""Account Strategy Agent 测试（TDD，P5.5.1，合并 Diagnosis + Strategy）。

覆盖：
- AccountStrategyOutput 严格 schema（account_id/strategy_summary 必填，account_health 0-100）
- DiagnosisOutput.to_diagnosis 子集提取
- 规则兜底确定性：有内容/空账号两种分档
- 选题候选注入周计划（topic_candidates → weekly_plan）
- 读-写 Memory 闭环：策略写入后再次运行能读到
- e2e：LLM 结构化输出 → 人类报告
- LLM 失败 → 规则兜底仍满足 schema
- 统计注入可核验
"""

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import sessionmaker

from socialmedia_agent.agents.account_strategy.graph import build_account_strategy_graph
from socialmedia_agent.agents.account_strategy.nodes import gather
from socialmedia_agent.agents.account_strategy.schemas import AccountStrategyOutput, DiagnosisOutput
from socialmedia_agent.agents.tools.base import ToolContext
from socialmedia_agent.agents.tools.catalog import build_core_tools
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.database.engine import create_db_engine
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, MetricSource, MetricType, Platform
from socialmedia_agent.domain.metric import Metric
from socialmedia_agent.domain.topic import Topic
from socialmedia_agent.evaluation.recording import RecordingRegistry
from socialmedia_agent.llm.circuit_breaker import CircuitBreaker
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.llm.providers import LLMProvider
from socialmedia_agent.memory.models import MemoryCategory
from socialmedia_agent.memory.store import SQLAlchemyMemoryStore
from socialmedia_agent.memory.summarizer import Summarizer
from socialmedia_agent.rag import HashEmbedder, InMemoryVectorStore, Retriever
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.metric_repo import MetricRepository
from socialmedia_agent.repositories.topic_repo import TopicRepository


def seed_db(tmp_path) -> Database:
    db = Database(url=f"sqlite:///{tmp_path / 'strategy.db'}")
    db.create_all()
    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="90001", nickname="UP主A")
        )
        AccountRepository(session).upsert(
            Account(platform=Platform.WEIBO, platform_id="90002", nickname="新号主B")
        )
        c1 = ContentRepository(session).upsert(
            Content(
                platform=Platform.BILIBILI,
                platform_content_id="1001",
                account_id="bilibili:90001",
                title="人工智能入门",
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
        for cid, views in ((c1.canonical_id, "1000"), (c2.canonical_id, "500")):
            MetricRepository(session).upsert(
                Metric(
                    content_id=cid,
                    account_id="bilibili:90001",
                    platform=Platform.BILIBILI,
                    metric_type=MetricType.VIEWS,
                    value=views,
                    captured_at="2026-08-24T10:00:00Z",
                    source=MetricSource.MEDIACRAWLER,
                )
            )
        TopicRepository(session).upsert(
            Topic(
                keyword="效率工具测评",
                platforms=[Platform.BILIBILI],
                last_seen=datetime.now(timezone.utc),
                post_count=50,
            )
        )
    return db


def make_context(tmp_path):
    db = seed_db(tmp_path)

    store = InMemoryVectorStore()
    emb = HashEmbedder(dim=64)
    store.add(
        emb.embed_texts(["运营策略：稳定更新 + 内容差异化 + 数据复盘"]),
        [{"title": "运营策略", "content": "运营策略：稳定更新 + 内容差异化 + 数据复盘"}],
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
        breaker=CircuitBreaker(name="strategy", failure_threshold=3, recovery_timeout=60),
    )


def test_account_strategy_output_schema_strict():
    out = AccountStrategyOutput(
        account_id="bilibili:90001",
        account_health=60,
        strengths=["更新稳定"],
        weaknesses=["互动率低"],
        anomalies=[],
        recommendations=["优化标题"],
        strategy_summary="稳定更新",
        weekly_plan=["每周 2 条"],
        kpis=["月度播放量 +20%"],
        risks=["互动率低"],
    )
    assert out.account_health == 60
    d = out.to_diagnosis()
    assert isinstance(d, DiagnosisOutput)
    assert d.account_health == 60
    assert d.strengths == ["更新稳定"]

    with pytest.raises(ValidationError):
        AccountStrategyOutput(account_id="x", account_health=200, strategy_summary="s")
    with pytest.raises(ValidationError):
        AccountStrategyOutput(account_id="x", account_health=50)  # strategy_summary 必填
    with pytest.raises(ValidationError):
        AccountStrategyOutput(account_health=50, strategy_summary="s")  # account_id 必填


def test_rule_fallback_with_content_and_topic_injection(tmp_path):
    ctx, reg, db = make_context(tmp_path)
    graph = build_account_strategy_graph(registry=reg, gateway=None)
    state = graph.invoke({"account_id": "bilibili:90001"})
    out = state["strategy"]
    assert out.account_id == "bilibili:90001"
    assert out.account_health == 60  # avg_views=750 → 60 档
    assert out.strategy_summary
    assert "750" in out.strategy_summary
    assert out.weekly_plan[0] == "优先制作热门选题：效率工具测评"  # 选题候选注入周计划
    assert out.kpis and out.risks
    assert state["report"]
    assert "UP主A" in state["report"]
    assert "账号健康度" in state["report"]


def test_rule_fallback_empty_account(tmp_path):
    ctx, reg, db = make_context(tmp_path)
    graph = build_account_strategy_graph(registry=reg, gateway=None)
    state = graph.invoke({"account_id": "weibo:90002"})
    out = state["strategy"]
    assert out.account_health == 30
    assert "尚无内容产出" in out.strategy_summary
    assert "近期无内容产出" in out.weaknesses
    assert out.weekly_plan and out.risks


def test_memory_write_read_closed_loop(tmp_path):
    ctx, reg, db = make_context(tmp_path)
    graph = build_account_strategy_graph(registry=reg, gateway=None)

    s1 = graph.invoke({"account_id": "bilibili:90001"})
    summary1 = s1["strategy"].strategy_summary

    entries = ctx.memory_store.list_for_account("bilibili:90001")
    assert any(
        e.category == MemoryCategory.STRATEGY and e.content == summary1 for e in entries
    )

    s2 = graph.invoke({"account_id": "bilibili:90001"})
    history = s2["facts"]["history"]
    assert "strategy" in history
    assert summary1 in history["strategy"]


def test_e2e_with_gateway(tmp_path):
    ctx, reg, db = make_context(tmp_path)
    provider = ScriptedProvider(
        [
            '{"account_id": "bilibili:90001", "account_health": 70, '
            '"strengths": ["更新稳定"], "weaknesses": ["互动率低"], "anomalies": [], '
            '"recommendations": ["优化标题"], "strategy_summary": "聚焦AI内容并稳定更新", '
            '"weekly_plan": ["每周3条AI教程"], "kpis": ["月播放量提升30%"], "risks": ["同质化"]}'
        ]
    )
    graph = build_account_strategy_graph(registry=reg, gateway=make_gateway(provider))
    state = graph.invoke({"account_id": "bilibili:90001"})
    out = state["strategy"]
    assert out.account_health == 70
    assert out.strategy_summary == "聚焦AI内容并稳定更新"
    assert out.weekly_plan == ["每周3条AI教程"]
    assert state["report"]
    assert "聚焦AI内容并稳定更新" in state["report"]


def test_llm_failure_falls_back_to_rules(tmp_path):
    ctx, reg, db = make_context(tmp_path)
    provider = ScriptedProvider(["not-json"])
    graph = build_account_strategy_graph(registry=reg, gateway=make_gateway(provider))
    state = graph.invoke({"account_id": "bilibili:90001"})
    assert isinstance(state["strategy"], AccountStrategyOutput)
    assert 0 <= state["strategy"].account_health <= 100
    assert state["strategy"].strategy_summary
    assert state["report"]


def test_statistics_injected_into_prompt(tmp_path):
    ctx, reg, db = make_context(tmp_path)
    provider = ScriptedProvider(
        [
            '{"account_id": "bilibili:90001", "account_health": 50, '
            '"strategy_summary": "s", "strengths": [], "weaknesses": [], "anomalies": [], '
            '"recommendations": [], "weekly_plan": [], "kpis": [], "risks": []}'
        ]
    )
    graph = build_account_strategy_graph(registry=reg, gateway=make_gateway(provider))
    graph.invoke({"account_id": "bilibili:90001"})
    assert "1500" in provider.last_user_content
    assert "2" in provider.last_user_content


def test_deterministic_gather_fetches_each_tool_exactly_once(tmp_path):
    """确定性 gather 不得重复取数：profile / recent / trends 各只取一次。

    回归测试：account_strategy.gather 曾复用 topic_recommendation.gather，
    后者会重建自己的上下文，导致每例重复 3 次取数（见 docs/issues.md）。
    """
    ctx, reg, db = make_context(tmp_path)
    recording = RecordingRegistry(reg)

    facts = gather(recording, "bilibili:90001")

    assert len(recording.calls) == len(set(recording.calls)), f"存在重复取数: {recording.calls}"
    assert sorted(recording.calls) == [
        "analyze_content_performance",
        "get_account_profile",
        "get_historical_strategy",
        "get_recent_contents",
        "get_trend_data",
        "search_operation_knowledge",
    ]
    # facts 形状与语义必须保持不变
    assert set(facts) == {
        "account_id",
        "profile",
        "performance",
        "recent_contents",
        "history",
        "trends",
        "topic_candidates",
    }
    assert len(facts["recent_contents"]) == 2  # 账号只有 2 条内容
