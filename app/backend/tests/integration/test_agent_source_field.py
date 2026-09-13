"""Agent 端点 source 字段集成测试（前端「来源透明」依赖）。

覆盖 6 个 Agent 端点：
- 未注入 gateway（生产无密钥）→ source == "rules"
- 注入 mock gateway 且输出合法 → source == "llm"
- 注入 mock gateway 但输出非法 → source == "rules"（失败必须诚实回退标注）
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from socialmedia_agent.api.main import create_app
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, MetricSource, MetricType, Platform
from socialmedia_agent.domain.metric import Metric
from socialmedia_agent.domain.topic import Topic
from socialmedia_agent.llm.circuit_breaker import CircuitBreaker
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.llm.providers import LLMProvider
from socialmedia_agent.memory.store import build_memory_store
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.metric_repo import MetricRepository
from socialmedia_agent.repositories.topic_repo import TopicRepository

STRATEGY_JSON = (
    '{"account_id": "bilibili:90001", "account_health": 88, "strategy_summary": "LLM策略",'
    ' "strengths": ["LLM优势"], "weaknesses": [], "anomalies": [], "recommendations": [],'
    ' "weekly_plan": [], "kpis": [], "risks": []}'
)
CONTENT_JSON = '{"content_id": "bilibili:1001", "quality_score": 88, "summary": "LLM摘要"}'
TREND_JSON = (
    '{"platform": "bilibili", "period": 7, "trend_score": 88, "insights": ["LLM洞察"]}'
)
TOPIC_JSON = (
    '{"account_id": "bilibili:90001", "topics": [{"title": "LLM选题", "rationale": "r",'
    ' "estimated_interest": 88}]}'
)
TITLE_JSON = (
    '{"original": "原标题", "optimized_titles": ["a", "b", "c"], "explanation": "LLM说明"}'
)

ENDPOINTS = [
    pytest.param("/api/v1/accounts/bilibili:90001/diagnosis", None, STRATEGY_JSON, id="diagnosis"),
    pytest.param("/api/v1/accounts/bilibili:90001/strategy", None, STRATEGY_JSON, id="strategy"),
    pytest.param("/api/v1/contents/bilibili:1001/analysis", None, CONTENT_JSON, id="content-analysis"),
    pytest.param(
        "/api/v1/trends/analysis",
        {"platform": "bilibili", "period": 7},
        TREND_JSON,
        id="trends",
    ),
    pytest.param(
        "/api/v1/accounts/bilibili:90001/topic-recommendation", None, TOPIC_JSON, id="topics"
    ),
    pytest.param("/api/v1/titles/optimize", {"title": "原标题"}, TITLE_JSON, id="titles"),
]


class ScriptedProvider(LLMProvider):
    def __init__(self, script: list[str]) -> None:
        self.script = script

    def complete(self, messages: list[dict], response_format: str = "text") -> str:
        return self.script.pop(0)


def _gateway(script: list[str]) -> LLMGateway:
    return LLMGateway(
        provider=ScriptedProvider(script),
        breaker=CircuitBreaker(name="src-api", failure_threshold=3, recovery_timeout=60),
    )


def _seed(db: Database) -> None:
    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="90001", nickname="UP主A")
        )
        content = ContentRepository(session).upsert(
            Content(
                platform=Platform.BILIBILI,
                platform_content_id="1001",
                account_id="bilibili:90001",
                title="人工智能入门",
                content_type=ContentType.VIDEO,
            )
        )
        MetricRepository(session).upsert(
            Metric(
                content_id=content.canonical_id,
                account_id="bilibili:90001",
                platform=Platform.BILIBILI,
                metric_type=MetricType.VIEWS,
                value="1000",
                captured_at="2026-08-24T10:00:00Z",
                source=MetricSource.MEDIACRAWLER,
            )
        )
        TopicRepository(session).upsert(
            Topic(keyword="AI 绘画", platforms=[Platform.BILIBILI], post_count=30)
        )


def _make(tmp_path, gateway):
    db = Database(url=f"sqlite:///{tmp_path / 'src.db'}")
    db.create_all()
    _seed(db)
    mem = build_memory_store(url=f"sqlite:///{tmp_path / 'src_mem.db'}")
    return create_app(database=db, memory_store=mem, gateway=gateway), db, mem


def _post(client: TestClient, path: str, body):
    return client.post(path) if body is None else client.post(path, json=body)


@pytest.mark.parametrize("path, body, payload", ENDPOINTS)
def test_source_is_rules_without_gateway(tmp_path, path, body, payload):
    app, db, mem = _make(tmp_path, gateway=None)
    with TestClient(app) as client:
        resp = _post(client, path, body)
    db.engine.dispose()
    mem.dispose()
    assert resp.status_code == 200, resp.text
    assert resp.json()["source"] == "rules"


@pytest.mark.parametrize("path, body, payload", ENDPOINTS)
def test_source_is_llm_with_injected_gateway(tmp_path, path, body, payload):
    app, db, mem = _make(tmp_path, gateway=_gateway([payload]))
    with TestClient(app) as client:
        resp = _post(client, path, body)
    db.engine.dispose()
    mem.dispose()
    assert resp.status_code == 200, resp.text
    assert resp.json()["source"] == "llm"


@pytest.mark.parametrize("path, body, payload", ENDPOINTS)
def test_source_is_rules_when_gateway_output_invalid(tmp_path, path, body, payload):
    """gateway 返回非法 JSON：结果回退规则兜底，source 必须标 rules（不能谎报 llm）。"""
    app, db, mem = _make(tmp_path, gateway=_gateway(["not-json"]))
    with TestClient(app) as client:
        resp = _post(client, path, body)
    db.engine.dispose()
    mem.dispose()
    assert resp.status_code == 200, resp.text
    assert resp.json()["source"] == "rules"


def test_source_is_rules_when_gateway_call_raises(tmp_path):
    """gateway 调用抛异常（如网络失败）→ 规则兜底 + source=rules。"""

    class BoomProvider(LLMProvider):
        def complete(self, messages: list[dict], response_format: str = "text") -> str:
            raise RuntimeError("boom")

    boom_gateway = LLMGateway(
        provider=BoomProvider(),
        breaker=CircuitBreaker(name="boom", failure_threshold=99, recovery_timeout=60),
    )
    app, db, mem = _make(tmp_path, gateway=boom_gateway)
    with TestClient(app) as client:
        resp = client.post("/api/v1/accounts/bilibili:90001/strategy")
    db.engine.dispose()
    mem.dispose()
    assert resp.status_code == 200, resp.text
    assert resp.json()["source"] == "rules"
