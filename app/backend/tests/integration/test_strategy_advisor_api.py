"""Strategy Advisor API 集成测试（P4-5）。

验证：POST /api/v1/accounts/{id}/strategy 返回 schema + 报告 + memory_saved；
Memory 读-写闭环（再次调用能读到已沉淀策略）；账号不存在 404。
"""

from fastapi.testclient import TestClient

from socialmedia_agent.api.main import create_app
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, MetricSource, MetricType, Platform
from socialmedia_agent.domain.metric import Metric
from socialmedia_agent.memory.store import SQLAlchemyMemoryStore, build_memory_store
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.metric_repo import MetricRepository


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


def test_strategy_returns_schema_report_and_saves_memory(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'strategy_api.db'}")
    db.create_all()
    mem = build_memory_store(url=f"sqlite:///{tmp_path / 'mem_api.db'}")
    app = create_app(database=db, memory_store=mem)
    _seed(db)
    with TestClient(app) as client:
        resp = client.post("/api/v1/accounts/bilibili:90001/strategy")
    db.engine.dispose()
    assert resp.status_code == 200
    body = resp.json()
    s = body["strategy"]
    assert s["account_id"] == "bilibili:90001"
    assert s["strategy_summary"]
    assert isinstance(s["weekly_plan"], list)
    assert isinstance(s["kpis"], list)
    assert isinstance(s["risks"], list)
    assert body["report"]
    assert body["memory_saved"]["account_id"] == "bilibili:90001"

    entries = mem.list_for_account("bilibili:90001")
    assert any(e.content == s["strategy_summary"] for e in entries)


def test_strategy_second_call_reads_saved_memory(tmp_path):
    """读-写闭环：第一次写入后，第二次 gather 能读到历史策略。"""
    db = Database(url=f"sqlite:///{tmp_path / 'strategy_api.db'}")
    db.create_all()
    mem = build_memory_store(url=f"sqlite:///{tmp_path / 'mem_api.db'}")
    app = create_app(database=db, memory_store=mem)
    _seed(db)
    with TestClient(app) as client:
        r1 = client.post("/api/v1/accounts/bilibili:90001/strategy")
        r2 = client.post("/api/v1/accounts/bilibili:90001/strategy")
    db.engine.dispose()
    assert r1.status_code == 200 and r2.status_code == 200
    assert mem.count() >= 1


def test_strategy_unknown_account_returns_404(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'strategy_api.db'}")
    app = create_app(database=db)
    with TestClient(app) as client:
        resp = client.post("/api/v1/accounts/does-not-exist/strategy")
    db.engine.dispose()
    assert resp.status_code == 404
