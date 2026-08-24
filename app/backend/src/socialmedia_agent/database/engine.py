"""数据库引擎：SQLite 起步（架构决策），通过 SQLAlchemy 抽象，便于未来迁移 PostgreSQL。

默认数据库文件位于 app/backend/data/sma.db，可通过环境变量 SMA_DB_URL 覆盖。
"""

import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine

DEFAULT_DB_DIR = Path(__file__).resolve().parents[3] / "data"
DEFAULT_DB_PATH = DEFAULT_DB_DIR / "sma.db"


def get_database_url() -> str:
    """默认 sqlite 文件 URL；SMA_DB_URL 可覆盖（如指向 PostgreSQL）。"""
    return os.getenv("SMA_DB_URL") or f"sqlite:///{DEFAULT_DB_PATH}"


def get_memory_database_url() -> str:
    """Memory 独立库 URL（与核心库物理分离，见架构约束）；SMA_MEMORY_DB_URL 可覆盖。"""
    return os.getenv("SMA_MEMORY_DB_URL") or f"sqlite:///{DEFAULT_DB_DIR / 'sma_memory.db'}"


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
