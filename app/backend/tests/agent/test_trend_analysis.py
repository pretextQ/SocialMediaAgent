"""Trend Analysis Agent 测试（TDD，P4-2）。

覆盖：
- TrendAnalysisOutput 严格 schema（platform/period/trend_score 0-100）
- 端到端：platform+period → gather 取数 → LLM 结构化输出 → 人类报告
- topics 字段强制取 DB 事实（LLM 不得编造话题）
- LLM 失败/非法输出 → 规则兜底仍满足 schema
- 规则兜底确定性：trend_score 由话题 post_count 计算，可核验
- period/platform 过滤
- 空数据兜底
"""

from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from socialmedia_agent.agents.tools.base import ToolContext
from socialmedia_agent.agents.tools.catalog import build_core_tools
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.agents.trend_analysis.graph import build_trend_analysis_graph
from socialmedia_agent.agents.trend_analysis.schemas import TrendAnalysisOutput
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.enums import Platform
from socialmedia_agent.domain.topic import Topic
from socialmedia_agent.llm.circuit_breaker import CircuitBreaker
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.llm.providers import LLMProvider
from socialmedia_agent.repositories.topic_repo import TopicRepository

NOW = datetime(2026, 8, 24, 12, 0, 0, tzinfo=timezone.utc)


def seed_db(tmp_path) -> Database:
    db = Database(url=f"sqlite:///{tmp_path / 'trend.db'}")
    db.create_all()
    with db.session() as session:
        repo = TopicRepository(session)
        repo.upsert(Topic(keyword="AI 绘画", platforms=[Platform.BILIBILI], last_seen=NOW, post_count=30))
        repo.upsert(Topic(keyword="职场效率", platforms=[Platform.BILIBILI], last_seen=NOW - timedelta(days=2), post_count=10))
        repo.upsert(Topic(keyword="美食探店", platforms=[Platform.XIAOHONGSHU], last_seen=NOW, post_count=50))
        repo.upsert(Topic(keyword="老话题", platforms=[Platform.BILIBILI], last_seen=NOW - timedelta(days=30), post_count=5))
    return db


def make_registry(tmp_path) -> ToolRegistry:
    db = seed_db(tmp_path)
    reg = ToolRegistry()
    for tool in build_core_tools(ToolContext(database=db)):
        reg.register(tool)
    return reg


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
        breaker=CircuitBreaker(name="trend", failure_threshold=3, recovery_timeout=60),
    )


def test_trend_analysis_output_schema_strict():
    out = TrendAnalysisOutput(
        platform="bilibili",
        period=7,
        topics=[{"keyword": "AI 绘画", "post_count": 30}],
        trend_score=75,
        insights=["热度最高"],
    )
    assert 0 <= out.trend_score <= 100

    with pytest.raises(ValidationError):
        TrendAnalysisOutput(platform="bilibili", period=7, trend_score=150)
    with pytest.raises(ValidationError):
        TrendAnalysisOutput(platform="bilibili", trend_score=50)  # period 必填
    with pytest.raises(ValidationError):
        TrendAnalysisOutput(period=7, trend_score=50)  # platform 必填


def test_trend_analysis_end_to_end(tmp_path):
    reg = make_registry(tmp_path)
    provider = ScriptedProvider(
        [
            '{"platform": "bilibili", "period": 7, "topics": [{"keyword": "编造话题", "post_count": 999}], '
            '"trend_score": 66, "insights": ["B站内容热度上升"]}'
        ]
    )
    graph = build_trend_analysis_graph(registry=reg, gateway=make_gateway(provider))
    state = graph.invoke({"platform": "bilibili", "period": 7})
    assert isinstance(state["analysis"], TrendAnalysisOutput)
    assert state["analysis"].trend_score == 66
    assert state["analysis"].platform == "bilibili"
    # topics 强制取 DB 事实，LLM 编造话题被覆盖
    keywords = [t.keyword for t in state["analysis"].topics]
    assert keywords == ["AI 绘画", "职场效率"]
    assert "编造话题" not in keywords
    assert state["report"]
    assert "趋势分析报告" in state["report"]


def test_rule_fallback_deterministic_score(tmp_path):
    """gateway=None：bilibili 近7天有 2 个话题（30+10 条）→ score = 20+30+25 = 75。"""
    reg = make_registry(tmp_path)
    graph = build_trend_analysis_graph(registry=reg, gateway=None)
    state = graph.invoke({"platform": "bilibili", "period": 7})
    analysis = state["analysis"]
    assert analysis.trend_score == 75
    assert [t.keyword for t in analysis.topics] == ["AI 绘画", "职场效率"]
    assert any("AI 绘画" in i for i in analysis.insights)


def test_empty_data_fallback(tmp_path):
    reg = make_registry(tmp_path)
    graph = build_trend_analysis_graph(registry=reg, gateway=None)
    state = graph.invoke({"platform": "weibo", "period": 7})
    analysis = state["analysis"]
    assert analysis.topics == []
    assert analysis.trend_score == 0
    assert any("无趋势话题" in i for i in analysis.insights)
    assert state["report"]


def test_period_and_platform_filtering(tmp_path):
    reg = make_registry(tmp_path)
    graph = build_trend_analysis_graph(registry=reg, gateway=None)

    s1 = graph.invoke({"platform": "bilibili", "period": 1})
    assert [t.keyword for t in s1["analysis"].topics] == ["AI 绘画"]

    s2 = graph.invoke({"platform": "xiaohongshu", "period": 7})
    assert [t.keyword for t in s2["analysis"].topics] == ["美食探店"]


def test_llm_failure_falls_back_to_rules(tmp_path):
    reg = make_registry(tmp_path)
    provider = ScriptedProvider(["not-json"])
    graph = build_trend_analysis_graph(registry=reg, gateway=make_gateway(provider))
    state = graph.invoke({"platform": "bilibili", "period": 7})
    assert isinstance(state["analysis"], TrendAnalysisOutput)
    assert 0 <= state["analysis"].trend_score <= 100
    assert state["report"]


def test_statistics_injected_into_prompt(tmp_path):
    """话题 post_count（30/10）与平台/周期必须注入 LLM prompt。"""
    reg = make_registry(tmp_path)
    provider = ScriptedProvider(
        [
            '{"platform": "bilibili", "period": 7, "trend_score": 50, '
            '"insights": [], "topics": []}'
        ]
    )
    graph = build_trend_analysis_graph(registry=reg, gateway=make_gateway(provider))
    graph.invoke({"platform": "bilibili", "period": 7})
    assert "30" in provider.last_user_content
    assert "AI 绘画" in provider.last_user_content
