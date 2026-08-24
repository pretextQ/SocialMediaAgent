"""LLM Gateway 注入集成测试（TDD，P5.5.3）。

验证完整链路：API → Agent → LLM Gateway → Provider → Agent。
- 注入 mock gateway：LLM 输出被采用（非规则兜底）
- gateway 调用失败：规则兜底仍返回合法结果（不破坏契约）
- 未注入 gateway：规则兜底确定性
"""

from fastapi.testclient import TestClient

from socialmedia_agent.api.main import create_app
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, MetricSource, MetricType, Platform
from socialmedia_agent.domain.metric import Metric
from socialmedia_agent.llm.circuit_breaker import CircuitBreaker
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.llm.providers import LLMProvider
from socialmedia_agent.memory.store import build_memory_store
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.metric_repo import MetricRepository


class ScriptedProvider(LLMProvider):
    def __init__(self, script: list[str]) -> None:
        self.script = script

    def complete(self, messages: list[dict], response_format: str = "text") -> str:
        return self.script.pop(0)


def make_gateway(script: list[str]) -> LLMGateway:
    return LLMGateway(
        provider=ScriptedProvider(script),
        breaker=CircuitBreaker(name="inj", failure_threshold=3, recovery_timeout=60),
    )


def _seed(db):
    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="90001", nickname="UP主A")
        )
        c = ContentRepository(session).upsert(
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
                content_id=c.canonical_id,
                account_id="bilibili:90001",
                platform=Platform.BILIBILI,
                metric_type=MetricType.VIEWS,
                value="1000",
                captured_at="2026-08-24T10:00:00Z",
                source=MetricSource.MEDIACRAWLER,
            )
        )


def _app(tmp_path, gateway=None):
    db = Database(url=f"sqlite:///{tmp_path / 'inj.db'}")
    db.create_all()
    _seed(db)
    mem = build_memory_store(url=f"sqlite:///{tmp_path / 'mem.db'}")
    return create_app(database=db, memory_store=mem, gateway=gateway), db


def test_api_uses_injected_gateway(tmp_path):
    """注入 mock gateway：LLM 输出被采用（health=77 非规则兜底值 75）。"""
    gateway = make_gateway(
        [
            '{"account_id": "bilibili:90001", "account_health": 77, '
            '"strategy_summary": "LLM生成策略", "strengths": ["LLM优势"], "weaknesses": [], '
            '"anomalies": [], "recommendations": [], "weekly_plan": [], "kpis": [], "risks": []}'
        ]
    )
    app, db = _app(tmp_path, gateway)
    with TestClient(app) as client:
        resp = client.post("/api/v1/accounts/bilibili:90001/strategy")
    db.engine.dispose()
    assert resp.status_code == 200
    body = resp.json()
    assert body["strategy"]["account_health"] == 77
    assert body["strategy"]["strategy_summary"] == "LLM生成策略"
    assert body["report"]


def test_api_falls_back_when_gateway_fails(tmp_path):
    """gateway 返回非法输出 → 规则兜底仍返回合法契约。"""
    app, db = _app(tmp_path, make_gateway(["not-json"]))
    with TestClient(app) as client:
        resp = client.post("/api/v1/accounts/bilibili:90001/strategy")
    db.engine.dispose()
    assert resp.status_code == 200
    body = resp.json()
    s = body["strategy"]
    assert 0 <= s["account_health"] <= 100
    assert s["strategy_summary"]
    assert body["report"]


def test_api_rule_fallback_without_gateway(tmp_path):
    """未注入 gateway（生产无密钥时）→ 规则兜底确定性（avg_views=1000 → health=75）。"""
    app, db = _app(tmp_path)
    with TestClient(app) as client:
        resp = client.post("/api/v1/accounts/bilibili:90001/strategy")
    db.engine.dispose()
    assert resp.status_code == 200
    s = resp.json()["strategy"]
    assert s["account_health"] == 75
