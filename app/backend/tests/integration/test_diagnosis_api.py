"""诊断 API 集成测试（P3）。

验证：POST /api/v1/accounts/{id}/diagnosis 返回 schema + 报告；账号不存在返回 404。
"""

from fastapi.testclient import TestClient

from socialmedia_agent.api.main import create_app
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.enums import Platform
from socialmedia_agent.repositories.account_repo import AccountRepository


def _seed(db):
    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="90001", nickname="UP主A")
        )


def test_diagnose_account_returns_schema_and_report(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'diag_api.db'}")
    db.create_all()
    app = create_app(database=db)
    _seed(db)
    with TestClient(app) as client:
        resp = client.post("/api/v1/accounts/bilibili:90001/diagnosis")
    db.engine.dispose()
    assert resp.status_code == 200
    body = resp.json()
    d = body["diagnosis"]
    assert 0 <= d["account_health"] <= 100
    for field in ("strengths", "weaknesses", "anomalies", "recommendations"):
        assert isinstance(d[field], list)
    assert body["report"]
    assert "UP主A" in body["report"]


def test_diagnose_unknown_account_returns_404(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'diag_api.db'}")
    app = create_app(database=db)
    with TestClient(app) as client:
        resp = client.post("/api/v1/accounts/does-not-exist/diagnosis")
    db.engine.dispose()
    assert resp.status_code == 404
