"""Trend Analysis API 集成测试（P4-2）。

验证：POST /api/v1/trends/analysis 返回 schema + 报告；空数据兜底返回 0 分。
"""

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from socialmedia_agent.api.main import create_app
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.enums import Platform
from socialmedia_agent.domain.topic import Topic
from socialmedia_agent.repositories.topic_repo import TopicRepository

NOW = datetime(2026, 8, 24, 12, 0, 0, tzinfo=timezone.utc)


def _seed(db):
    with db.session() as session:
        repo = TopicRepository(session)
        repo.upsert(Topic(keyword="AI 绘画", platforms=[Platform.BILIBILI], last_seen=NOW, post_count=30))
        repo.upsert(Topic(keyword="职场效率", platforms=[Platform.BILIBILI], last_seen=NOW, post_count=10))


def test_trend_analysis_returns_schema_and_report(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'trend_api.db'}")
    db.create_all()
    app = create_app(database=db)
    _seed(db)
    with TestClient(app) as client:
        resp = client.post("/api/v1/trends/analysis", json={"platform": "bilibili", "period": 7})
    db.engine.dispose()
    assert resp.status_code == 200
    body = resp.json()
    a = body["analysis"]
    assert a["platform"] == "bilibili"
    assert a["period"] == 7
    assert 0 <= a["trend_score"] <= 100
    assert len(a["topics"]) == 2
    assert a["topics"][0]["keyword"] == "AI 绘画"
    assert body["report"]
    assert "趋势分析报告" in body["report"]


def test_trend_analysis_empty_data_fallback(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'trend_api.db'}")
    db.create_all()
    app = create_app(database=db)
    with TestClient(app) as client:
        resp = client.post("/api/v1/trends/analysis", json={"platform": "weibo", "period": 7})
    db.engine.dispose()
    assert resp.status_code == 200
    a = resp.json()["analysis"]
    assert a["topics"] == []
    assert a["trend_score"] == 0
