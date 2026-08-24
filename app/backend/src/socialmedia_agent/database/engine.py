"""数据库引擎：SQLite 起步（架构决策），通过 SQLAlchemy 抽象，便于未来迁移 PostgreSQL。

默认数据库文件与 Memory 独立库路径由配置层（config.py / .env）管理。
"""

from __future__ import annotations

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine

from socialmedia_agent.config import get_settings


def get_database_url() -> str:
    """核心库 URL；由 SMA_DB_URL（env/.env）覆盖，默认 data/sma.db。"""
    return get_settings().database_url


def get_memory_database_url() -> str:
    """Memory 独立库 URL（与核心库物理分离）；由 SMA_MEMORY_DB_URL 覆盖。"""
    return get_settings().memory_database_url


def create_db_engine(url: str | None = None) -> Engine:
    url = url or get_database_url()
    if url.startswith("sqlite"):
        engine = create_engine(url, connect_args={"check_same_thread": False})

        @event.listens_for(engine, "connect")
        def _enable_foreign_keys(dbapi_conn, _record):  # pragma: no cover - 连接事件
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        return engine
    return create_engine(url)
