"""API 依赖注入。"""

from __future__ import annotations

from collections.abc import Iterator

from fastapi import Request
from sqlalchemy.orm import Session

from socialmedia_agent.database.session import Database
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
