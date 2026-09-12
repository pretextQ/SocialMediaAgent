"""查询服务：账户 / 内容的统一读取入口。

**为什么存在**：此前 API 路由与 MCP handler 各自直查 Repository，同一段「查库 + 映射领域模型」
有两份实现——字段或映射一变，两处都要改，而且很容易只改一处。

现在两者（以及未来任何调用方）都走这里，映射逻辑只有一份。

约定：**只读**、返回**领域模型**；序列化（dict / response_model）由调用方决定，
因为 API 要 Pydantic 模型、MCP 要 JSON 友好的 dict。
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.content import Content
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository


def list_accounts(
    session: Session, *, platform: str | None = None, limit: int = 100
) -> list[Account]:
    """按平台过滤列出账号（默认上限 100，调用方应按需显式提高）。"""
    return [
        model.to_domain()
        for model in AccountRepository(session).list(platform=platform, limit=limit)
    ]


def list_contents(
    session: Session, *, platform: str | None = None, limit: int = 100
) -> list[Content]:
    """按平台过滤列出内容。"""
    return [
        model.to_domain()
        for model in ContentRepository(session).list(platform=platform, limit=limit)
    ]
