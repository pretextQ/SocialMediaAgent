"""Topic Recommendation API 集成测试（P4-3）。

验证：POST /api/v1/accounts/{id}/topic-recommendation 返回 schema + 报告；
已有内容标题被去重；账号不存在返回 404。
"""

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from socialmedia_agent.api.main import create_app
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, Platform
from socialmedia_agent.domain.topic import Topic
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.topic_repo import TopicRepository

# 锚点取真实当前时间：get_trend_data 按 now-period 过滤 last_seen，硬编码日期会随日期推移失效。
NOW = datetime.now(timezone.utc)


def _seed(db):
    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="90001", nickname="UP主A")
        )
        ContentRepository(session).upsert(
            Content(
                platform=Platform.BILIBILI,
                platform_content_id="1001",
                account_id="bilibili:90001",
                title="AI 绘画",
                content_type=ContentType.VIDEO,
            )
        )
        TopicRepository(session).upsert(
            Topic(keyword="效率工具测评", platforms=[Platform.BILIBILI], last_seen=NOW, post_count=50)
        )
        TopicRepository(session).upsert(
            Topic(keyword="AI 绘画", platforms=[Platform.BILIBILI], last_seen=NOW, post_count=100)
        )


def test_topic_recommendation_returns_schema_and_report(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'rec_api.db'}")
    db.create_all()
    app = create_app(database=db)
    _seed(db)
    with TestClient(app) as client:
        resp = client.post("/api/v1/accounts/bilibili:90001/topic-recommendation")
    db.engine.dispose()
    assert resp.status_code == 200
    body = resp.json()
    rec = body["recommendation"]
    assert rec["account_id"] == "bilibili:90001"
    titles = [t["title"] for t in rec["topics"]]
    assert titles == ["效率工具测评"]  # AI 绘画 与已有内容重复被去重
    assert all(0 <= t["estimated_interest"] <= 100 for t in rec["topics"])
    assert body["report"]
    assert "选题推荐报告" in body["report"]


def test_topic_recommendation_unknown_account_returns_404(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'rec_api.db'}")
    app = create_app(database=db)
    with TestClient(app) as client:
        resp = client.post("/api/v1/accounts/does-not-exist/topic-recommendation")
    db.engine.dispose()
    assert resp.status_code == 404
