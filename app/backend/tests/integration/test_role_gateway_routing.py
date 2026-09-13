"""角色级 LLM gateway 路由集成测试。

「per-Agent 模型配置」能生效的前提是**角色解析正确**——角色传错了，配的模型就白配。
这里让 gateway_factory 只记录角色并返回 None（规则兜底），因此测试确定性、不触网。

同时覆盖兜底语义：**未注入 factory 时所有角色共用 app.state.gateway**，
这正是既有集成测试的注入方式，必须保持不变。
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from socialmedia_agent.api.main import create_app
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, Platform
from socialmedia_agent.memory.store import build_memory_store
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository


def _seed(db: Database) -> None:
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


def test_each_agent_endpoint_asks_for_its_role(tmp_path):
    """6 个 Agent 端点各自索取正确的角色 gateway。"""
    roles: list[str | None] = []

    def factory(role: str | None):
        roles.append(role)
        return None  # 规则兜底：确定性且不触网

    db = Database(url=f"sqlite:///{tmp_path / 'role.db'}")
    db.create_all()
    _seed(db)
    mem = build_memory_store(url=f"sqlite:///{tmp_path / 'role_mem.db'}")
    app = create_app(database=db, memory_store=mem, gateway_factory=factory)

    calls: list[tuple[str, dict | None]] = [
        ("/api/v1/accounts/bilibili:90001/diagnosis", None),
        ("/api/v1/accounts/bilibili:90001/strategy", None),
        ("/api/v1/accounts/bilibili:90001/topic-recommendation", None),
        ("/api/v1/contents/bilibili:1001/analysis", None),
        ("/api/v1/trends/analysis", {"platform": "bilibili", "period": 7}),
        ("/api/v1/titles/optimize", {"title": "如何做出爆款短视频"}),
    ]
    with TestClient(app) as client:
        results = [
            (path, client.post(path, json=body).status_code if body else client.post(path).status_code)
            for path, body in calls
        ]

    db.engine.dispose()
    mem.dispose()

    assert all(code == 200 for _, code in results), results
    assert roles == [
        "account_strategy",  # /diagnosis 是 Account Strategy 的兼容子集
        "account_strategy",
        "topic_recommendation",
        "content_analysis",
        "trend_analysis",
        "title_optimization",
    ]
