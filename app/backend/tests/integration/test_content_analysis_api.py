"""Content Analysis API 集成测试（P4-1）。

验证：POST /api/v1/contents/{id}/analysis 返回 schema + 报告；内容不存在返回 404。
"""

from fastapi.testclient import TestClient

from socialmedia_agent.api.main import create_app
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, MetricSource, MetricType, Platform
from socialmedia_agent.domain.metric import Metric
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


def test_analyze_content_returns_schema_and_report(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'ca_api.db'}")
    db.create_all()
    app = create_app(database=db)
    _seed(db)
    with TestClient(app) as client:
        resp = client.post("/api/v1/contents/bilibili:1001/analysis")
    db.engine.dispose()
    assert resp.status_code == 200
    body = resp.json()
    a = body["analysis"]
    assert a["content_id"] == "bilibili:1001"
    assert 0 <= a["quality_score"] <= 100
    for field in ("summary", "strengths", "weaknesses", "suggestions"):
        assert field in a
    assert body["report"]
    assert "人工智能入门" in body["report"]


def test_analyze_unknown_content_returns_404(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'ca_api.db'}")
    app = create_app(database=db)
    with TestClient(app) as client:
        resp = client.post("/api/v1/contents/does-not-exist/analysis")
    db.engine.dispose()
    assert resp.status_code == 404
