"""API 依赖注入。"""

from __future__ import annotations

from collections.abc import Iterator

from fastapi import Request
from sqlalchemy.orm import Session

from socialmedia_agent.database.session import Database
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.memory.store import SQLAlchemyMemoryStore, build_memory_store


def get_session(request: Request) -> Iterator[Session]:
    database: Database = request.app.state.database
    with database.session() as session:
        yield session


def get_memory_store(request: Request) -> SQLAlchemyMemoryStore:
    """取应用级 Memory store；未注入则按默认路径惰性构建并缓存。"""
    store = getattr(request.app.state, "memory_store", None)
    if store is None:
        store = build_memory_store()  # 默认 Memory 独立库（env 可覆盖）
        request.app.state.memory_store = store
    return store


def get_gateway(request: Request, role: str | None = None) -> LLMGateway | None:
    """取「该角色应使用的」LLM gateway。

    生产入口注入 `app.state.gateway_factory`（按角色构建，各自独立熔断与模型）；
    未注入 factory 时回落到 `app.state.gateway`——测试只需注入一个 gateway，
    既有用例行为完全不变。两者都没有（或未配置密钥）时返回 None，调用方走规则兜底。
    """
    factory = getattr(request.app.state, "gateway_factory", None)
    if factory is not None:
        return factory(role)
    return getattr(request.app.state, "gateway", None)
