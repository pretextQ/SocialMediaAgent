"""列表查询的单一实现（技术债）。

**问题**：API 路由与 MCP handler 各自直查 Repository，「查库 + 映射领域模型」这段逻辑有两份。
字段或映射一变，两处都要改，而且很容易只改一处。

**现在**：两者都走 `services/queries`。这里用两类断言守住它：

1. **行为**：两条路径都必须**经过服务层**——用 spy 拦截服务函数来验证，
   而不是 grep 源码（grep 会把注释/文档字符串里的 "Repository" 也算上，逼着人改注释而不是改结构）；
2. **一致性**：两条路径对同一份数据必须给出相同结果。
"""

from datetime import datetime, timezone
from decimal import Decimal

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
from socialmedia_agent.services import mcp_tools, queries


def _seed(tmp_path) -> Database:
    db = Database(url=f"sqlite:///{tmp_path / 'queries.db'}")
    db.create_all()
    now = datetime.now(timezone.utc)
    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="90001", nickname="UP主A")
        )
        AccountRepository(session).upsert(
            Account(platform=Platform.WEIBO, platform_id="90002", nickname="微博B")
        )
        content = ContentRepository(session).upsert(
            Content(
                platform=Platform.BILIBILI, platform_content_id="1001",
                account_id="bilibili:90001", title="人工智能入门",
                content_type=ContentType.VIDEO, publish_time=now,
            )
        )
        MetricRepository(session).upsert(
            Metric(
                content_id=content.canonical_id, account_id="bilibili:90001",
                platform=Platform.BILIBILI, metric_type=MetricType.VIEWS,
                value=Decimal("1500"), captured_at=now, source=MetricSource.MANUAL,
            )
        )
    return db


@pytest.fixture
def spy_accounts(monkeypatch):
    """拦截服务层账号列表，记录调用参数。"""
    calls: list[tuple] = []
    real = queries.list_accounts

    def spy(session, *, platform=None, limit=100):
        calls.append((platform, limit))
        return real(session, platform=platform, limit=limit)

    monkeypatch.setattr(queries, "list_accounts", spy)
    return calls


@pytest.fixture
def spy_contents(monkeypatch):
    calls: list[tuple] = []
    real = queries.list_contents

    def spy(session, *, platform=None, limit=100):
        calls.append((platform, limit))
        return real(session, platform=platform, limit=limit)

    monkeypatch.setattr(queries, "list_contents", spy)
    return calls


def test_api_account_listing_goes_through_shared_service(tmp_path, spy_accounts):
    db = _seed(tmp_path)

    app = create_app(database=db)
    with TestClient(app) as client:
        assert client.get("/api/v1/accounts").status_code == 200

    assert spy_accounts == [(None, 100)]


def test_mcp_account_listing_goes_through_shared_service(tmp_path, spy_accounts):
    db = _seed(tmp_path)

    accounts = mcp_tools.run_list_accounts(db, limit=5)

    assert spy_accounts == [(None, 5)]
    assert len(accounts) == 2


def test_api_content_listing_goes_through_shared_service(tmp_path, spy_contents):
    db = _seed(tmp_path)

    app = create_app(database=db)
    with TestClient(app) as client:
        assert client.get("/api/v1/contents").status_code == 200

    assert spy_contents == [(None, 100)]


def test_mcp_content_listing_goes_through_shared_service(tmp_path, spy_contents):
    db = _seed(tmp_path)

    contents = mcp_tools.run_list_contents(db, limit=3)

    assert spy_contents == [(None, 3)]
    assert contents[0]["title"] == "人工智能入门"


def test_api_and_mcp_paths_return_identical_accounts(tmp_path):
    db = _seed(tmp_path)

    with db.session() as session:
        service_accounts = [a.model_dump() for a in queries.list_accounts(session, limit=100)]
    mcp_accounts = mcp_tools.run_list_accounts(db, limit=100)

    assert mcp_accounts == service_accounts
    assert len(service_accounts) == 2


def test_listing_filters_by_platform(tmp_path):
    db = _seed(tmp_path)

    with db.session() as session:
        assert len(queries.list_accounts(session, platform="bilibili")) == 1
        assert queries.list_accounts(session, platform="douyin") == []
