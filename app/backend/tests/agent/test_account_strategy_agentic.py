"""Account Strategy 的 Agentic gather 测试（TDD，M2）。

覆盖：
- LLM 自主选择工具：只为被调用的工具产出 facts，并保留调用轨迹
- 工具结果映射到与确定性 gather 相同的语义键
- LLM 路径失败 -> 回退确定性 gather（facts 形状完整、source=rules）
- 从模型取到的趋势数据派生 topic_candidates
- 图：agentic=True 时 state 带 gather_source 与 tool_trace
- 图：默认（agentic 未开启）**不**走 LLM 工具决策（防止默认行为被悄悄改掉）
"""

import json
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import sessionmaker

from socialmedia_agent.agents.account_strategy.agentic import AgenticGather, gather_agentic
from socialmedia_agent.agents.account_strategy.graph import build_account_strategy_graph
from socialmedia_agent.agents.tools.catalog import build_registry
from socialmedia_agent.database.engine import create_db_engine
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, MetricSource, MetricType, Platform
from socialmedia_agent.domain.metric import Metric
from socialmedia_agent.domain.topic import Topic
from socialmedia_agent.llm.circuit_breaker import CircuitBreaker
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.llm.providers import (
    ProviderToolCall,
    ProviderToolResult,
    ToolCallingProvider,
)
from socialmedia_agent.memory.store import SQLAlchemyMemoryStore
from socialmedia_agent.memory.summarizer import Summarizer
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.metric_repo import MetricRepository
from socialmedia_agent.repositories.topic_repo import TopicRepository

AID = "bilibili:90001"


def seed_db(tmp_path) -> Database:
    db = Database(url=f"sqlite:///{tmp_path / 'agentic.db'}")
    db.create_all()
    now = datetime.now(timezone.utc)
    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="90001", nickname="UP主A")
        )
        content = ContentRepository(session).upsert(
            Content(
                platform=Platform.BILIBILI, platform_content_id="a1", account_id=AID,
                title="内容一", content_type=ContentType.VIDEO, publish_time=now,
            )
        )
        MetricRepository(session).upsert(
            Metric(
                content_id=content.canonical_id, account_id=AID, platform=Platform.BILIBILI,
                metric_type=MetricType.VIEWS, value=Decimal("1000"),
                captured_at=now, source=MetricSource.SYNTHETIC,
            )
        )
        TopicRepository(session).upsert(
            Topic(keyword="效率工具测评", platforms=[Platform.BILIBILI], last_seen=now, post_count=42)
        )
    return db


def make_memory(tmp_path) -> SQLAlchemyMemoryStore:
    engine = create_db_engine(f"sqlite:///{tmp_path / 'mem.db'}")
    SQLAlchemyMemoryStore.create_all(engine)
    return SQLAlchemyMemoryStore(sessionmaker(bind=engine, expire_on_commit=False)())


def make_registry(db, memory):
    return build_registry(db, retriever=None, memory_store=memory, summarizer=Summarizer())


class ScriptedToolProvider(ToolCallingProvider):
    """complete_with_tools 走脚本；complete 返回合法的策略 JSON（供 analyze 用）。"""

    def __init__(self, script, account_id=AID):
        self.script = list(script)
        self.account_id = account_id
        self.tool_call_rounds = 0
        self.text_calls = 0

    def complete(self, messages, response_format="text"):
        self.text_calls += 1
        return json.dumps({
            "account_id": self.account_id,
            "account_health": 70,
            "strengths": [], "weaknesses": [], "anomalies": [], "recommendations": [],
            "strategy_summary": "模型给的摘要",
            "weekly_plan": [], "kpis": [], "risks": [],
        }, ensure_ascii=False)

    def complete_with_tools(self, messages, tools):
        self.tool_call_rounds += 1
        step = self.script.pop(0)
        if isinstance(step, Exception):
            raise step
        return step


def make_gateway(provider):
    return LLMGateway(
        provider=provider,
        breaker=CircuitBreaker(name="t", failure_threshold=99, recovery_timeout=60),
    )


def call(name, **args):
    return ProviderToolResult(
        tool_calls=[ProviderToolCall(id=f"c-{name}", name=name, arguments=args)]
    )


def final(text="ok"):
    return ProviderToolResult(content=text, tool_calls=[])


def test_gather_agentic_only_includes_tools_the_model_chose(tmp_path):
    db = seed_db(tmp_path)
    registry = make_registry(db, make_memory(tmp_path))
    provider = ScriptedToolProvider([call("get_account_profile", account_id=AID), final()])

    result = gather_agentic(registry, make_gateway(provider), AID)

    assert isinstance(result, AgenticGather)
    assert result.source == "llm"
    assert result.tool_trace == ["get_account_profile"]
    assert result.facts["account_id"] == AID
    assert result.facts["profile"]["nickname"] == "UP主A"
    # 模型没调的工具不应出现在 facts 中
    assert "performance" not in result.facts
    assert "recent_contents" not in result.facts


def test_gather_agentic_maps_tool_results_to_semantic_keys(tmp_path):
    db = seed_db(tmp_path)
    registry = make_registry(db, make_memory(tmp_path))
    provider = ScriptedToolProvider([
        call("analyze_content_performance", account_id=AID),
        call("get_recent_contents", account_id=AID, limit=5),
        final(),
    ])

    result = gather_agentic(registry, make_gateway(provider), AID)

    assert result.tool_trace == ["analyze_content_performance", "get_recent_contents"]
    assert result.facts["performance"]["content_count"] == 1
    assert len(result.facts["recent_contents"]) == 1


def test_gather_agentic_falls_back_to_deterministic_on_llm_failure(tmp_path):
    db = seed_db(tmp_path)
    registry = make_registry(db, make_memory(tmp_path))
    provider = ScriptedToolProvider([RuntimeError("boom")] * 6)

    result = gather_agentic(registry, make_gateway(provider), AID)

    assert result.source == "rules"
    assert result.tool_trace == []
    # 回退后必须是完整的确定性形状，不能是半份事实
    assert result.facts["performance"]["content_count"] == 1
    assert "recent_contents" in result.facts
    assert "trends" in result.facts
    assert "topic_candidates" in result.facts


def test_gather_agentic_derives_topic_candidates_from_trends(tmp_path):
    db = seed_db(tmp_path)
    registry = make_registry(db, make_memory(tmp_path))
    provider = ScriptedToolProvider([
        call("get_trend_data", platform="bilibili", period=7),
        final(),
    ])

    result = gather_agentic(registry, make_gateway(provider), AID)

    assert result.facts["trends"][0]["keyword"] == "效率工具测评"
    assert result.facts["topic_candidates"][0]["title"] == "效率工具测评"


def test_graph_agentic_records_source_and_trace(tmp_path):
    db = seed_db(tmp_path)
    registry = make_registry(db, make_memory(tmp_path))
    provider = ScriptedToolProvider([
        call("get_account_profile", account_id=AID),
        call("analyze_content_performance", account_id=AID),
        final(),
    ])
    graph = build_account_strategy_graph(registry, gateway=make_gateway(provider), agentic=True)

    state = graph.invoke({"account_id": AID})

    assert state["gather_source"] == "llm"
    assert state["tool_trace"] == ["get_account_profile", "analyze_content_performance"]
    assert state["strategy"].account_id == AID
    assert state["report"]


def test_graph_default_does_not_use_llm_tool_decision(tmp_path):
    """默认行为必须仍是确定性 gather —— 防止 agentic 被悄悄改成默认。"""
    db = seed_db(tmp_path)
    registry = make_registry(db, make_memory(tmp_path))
    provider = ScriptedToolProvider([])  # 若走 tool calling 会因脚本为空而失败
    graph = build_account_strategy_graph(registry, gateway=make_gateway(provider))

    state = graph.invoke({"account_id": AID})

    assert state["gather_source"] == "rules"
    assert state["tool_trace"] == []
    assert provider.tool_call_rounds == 0
    assert provider.text_calls == 1  # analyze 仍会调用模型生成结构化输出
