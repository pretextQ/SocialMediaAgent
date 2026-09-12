"""API 集成测试（注入临时数据库，使用 TestClient）。"""

import pytest
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


@pytest.fixture
def client(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'api.db'}")
    app = create_app(database=db)
    with TestClient(app) as c:
        yield c, db
    db.engine.dispose()


def _seed(db):
    with db.session() as session:
        acc = AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="90001", nickname="UP主A")
        )
        content = ContentRepository(session).upsert(
            Content(
                platform=Platform.BILIBILI,
                platform_content_id="1001",
                account_id=acc.canonical_id,
                title="人工智能入门",
                content_type=ContentType.VIDEO,
            )
        )
        MetricRepository(session).upsert(
            Metric(
                content_id=content.canonical_id,
                account_id=acc.canonical_id,
                platform=Platform.BILIBILI,
                metric_type=MetricType.VIEWS,
                value="123000",
                captured_at="2026-08-24T10:00:00Z",
                source=MetricSource.MEDIACRAWLER,
            )
        )
    return acc, content


def test_list_accounts(client):
    c, db = client
    _seed(db)
    resp = c.get("/api/v1/accounts")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["canonical_id"] == "bilibili:90001"
    assert data[0]["owner_type"] == "observed"
    assert "platform_id" in data[0]


def test_filter_accounts_by_platform(client):
    c, db = client
    _seed(db)
    resp = c.get("/api/v1/accounts", params={"platform": "bilibili"})
    assert len(resp.json()) == 1
    resp2 = c.get("/api/v1/accounts", params={"platform": "douyin"})
    assert resp2.json() == []


def test_get_account_not_found(client):
    c, _ = client
    resp = c.get("/api/v1/accounts/nope")
    assert resp.status_code == 404


def test_list_contents(client):
    c, db = client
    _seed(db)
    resp = c.get("/api/v1/contents")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["canonical_id"] == "bilibili:1001"
    assert data[0]["account_id"] == "bilibili:90001"


def test_list_metrics_filter_by_content(client):
    from decimal import Decimal

    c, db = client
    acc, content = _seed(db)
    resp = c.get("/api/v1/metrics", params={"content_id": content.canonical_id})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["metric_type"] == "views"
    assert Decimal(data[0]["value"]) == Decimal("123000")  # Decimal JSON 序列化为字符串，保精度


def test_content_metric_linked_through_api(client):
    c, db = client
    acc, content = _seed(db)
    content_resp = c.get(f"/api/v1/contents/{content.id}").json()
    metric_resp = c.get("/api/v1/metrics", params={"content_id": content_resp["canonical_id"]}).json()
    assert metric_resp[0]["content_id"] == content_resp["canonical_id"]


def test_list_accounts_limit_is_explicit_and_raisable(client):
    """回归：GET /accounts 曾无 limit 参数，被 Repository 默认值静默截断到 100（issues.md #8）。

    修复后要求：上限**显式化且可调**——默认 100，传入更大的 limit 能取回超过 100 条。
    注意这不是「取消上限」：无界查询不可接受，上限本身要保留。
    """
    c, db = client
    with db.session() as session:
        repo = AccountRepository(session)
        for i in range(120):
            repo.upsert(
                Account(platform=Platform.BILIBILI, platform_id=f"7{i:05d}", nickname=f"账号{i}")
            )

    assert len(c.get("/api/v1/accounts").json()) == 100  # 默认上限是显式的
    assert len(c.get("/api/v1/accounts", params={"limit": 2}).json()) == 2
    assert len(c.get("/api/v1/accounts", params={"limit": 500}).json()) == 120  # 可调高，不再静默截断


def test_list_accounts_rejects_limit_out_of_range(client):
    c, _ = client
    assert c.get("/api/v1/accounts", params={"limit": 0}).status_code == 422
    assert c.get("/api/v1/accounts", params={"limit": 501}).status_code == 422
