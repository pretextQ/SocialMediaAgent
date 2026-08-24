"""Title Optimization API 集成测试（P4-4）。

验证：POST /api/v1/titles/optimize
- content_id 模式：返回 original + 固定 3 条 + 报告
- 原始标题模式：直接用传入标题
- 内容不存在 → 404；两者皆缺 → 422
"""

from fastapi.testclient import TestClient

from socialmedia_agent.api.main import create_app
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, Platform
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository


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
                title="人工智能入门",
                content_type=ContentType.VIDEO,
            )
        )


def test_optimize_by_content_id(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'title_api.db'}")
    db.create_all()
    app = create_app(database=db)
    _seed(db)
    with TestClient(app) as client:
        resp = client.post("/api/v1/titles/optimize", json={"content_id": "bilibili:1001"})
    db.engine.dispose()
    assert resp.status_code == 200
    body = resp.json()
    opt = body["optimization"]
    assert opt["original"] == "人工智能入门"
    assert len(opt["optimized_titles"]) == 3
    assert opt["explanation"]
    assert body["report"]
    assert "标题优化" in body["report"]


def test_optimize_by_raw_title(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'title_api.db'}")
    app = create_app(database=db)
    with TestClient(app) as client:
        resp = client.post("/api/v1/titles/optimize", json={"title": "如何学Python"})
    db.engine.dispose()
    assert resp.status_code == 200
    opt = resp.json()["optimization"]
    assert opt["original"] == "如何学Python"
    assert len(opt["optimized_titles"]) == 3


def test_optimize_unknown_content_returns_404(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'title_api.db'}")
    app = create_app(database=db)
    with TestClient(app) as client:
        resp = client.post("/api/v1/titles/optimize", json={"content_id": "does-not-exist"})
    db.engine.dispose()
    assert resp.status_code == 404


def test_optimize_missing_input_returns_422(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'title_api.db'}")
    app = create_app(database=db)
    with TestClient(app) as client:
        resp = client.post("/api/v1/titles/optimize", json={})
    db.engine.dispose()
    assert resp.status_code == 422
