"""Memory 存储：账号历史运营特征独立持久化（独立 DB，与 RAG 物理分离）。"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime

from sqlalchemy import String, Text
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    scoped_session,
    sessionmaker,
)

from socialmedia_agent.database.base import UTCDateTime
from socialmedia_agent.database.engine import create_db_engine, get_memory_database_url
from socialmedia_agent.memory.models import MemoryCategory, MemoryEntry

logger = logging.getLogger(__name__)


class MemoryBase(DeclarativeBase):
    """Memory 专用 ORM 基类（与核心库 Base 分离，物理隔离）。"""


class MemoryRecord(MemoryBase):
    __tablename__ = "memory_entries"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    account_id: Mapped[str] = mapped_column(String(128), index=True)
    category: Mapped[str] = mapped_column(String(32), index=True)
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime)
    expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)


class SQLAlchemyMemoryStore:
    """Memory 存储。

    `session` 可能是：

    - `scoped_session`（`build_memory_store` 的产物）→ **每线程**一个 Session，
      避免 FastAPI 线程池并发共用一个非线程安全的 Session；
    - 普通 `Session`（测试直接传入）→ 由调用方负责其生命周期。
    """

    def __init__(self, session, engine=None):
        self.session = session
        self._engine = engine

    @staticmethod
    def create_all(engine) -> None:
        MemoryBase.metadata.create_all(engine)

    def dispose(self) -> None:
        """释放 session 与引擎（应用关闭时调用；幂等）。

        此前**从不释放**：引擎与 Session 一直留到进程结束。
        """
        remover = getattr(self.session, "remove", None)
        if callable(remover):
            remover()
        else:
            self.session.close()
        if self._engine is not None:
            self._engine.dispose()
            self._engine = None

    def add(self, entry: MemoryEntry) -> MemoryEntry:
        record = MemoryRecord(
            id=entry.id or uuid.uuid4().hex,
            account_id=entry.account_id,
            category=entry.category.value,
            content=entry.content,
            created_at=entry.created_at,
            expires_at=entry.expires_at,
        )
        self.session.merge(record)
        self.session.commit()
        entry.id = record.id
        # 只记录元数据，不记录 content（防敏感信息）
        logger.info("Memory 写入 account=%s category=%s id=%s", entry.account_id, entry.category.value, entry.id)
        return entry

    def list_for_account(
        self,
        account_id: str,
        category: MemoryCategory | None = None,
    ) -> list[MemoryEntry]:
        query = self.session.query(MemoryRecord).filter(
            MemoryRecord.account_id == account_id
        )
        if category is not None:
            query = query.filter(MemoryRecord.category == category.value)
        records = query.order_by(MemoryRecord.created_at.desc()).all()
        return [
            MemoryEntry(
                id=r.id,
                account_id=r.account_id,
                category=MemoryCategory(r.category),
                content=r.content,
                created_at=r.created_at,
                expires_at=r.expires_at,
            )
            for r in records
            if not self._is_expired(r)
        ]

    def delete(self, memory_id: str) -> None:
        self.session.query(MemoryRecord).filter(MemoryRecord.id == memory_id).delete()
        self.session.commit()

    def count(self) -> int:
        return self.session.query(MemoryRecord).count()

    @staticmethod
    def _is_expired(record: MemoryRecord) -> bool:
        if record.expires_at is None:
            return False
        return datetime.now(record.expires_at.tzinfo) > record.expires_at


def build_memory_store(url: str | None = None) -> SQLAlchemyMemoryStore:
    """构造 Memory 独立库 store（建表 + **线程局部**会话）。

    用 `scoped_session` 而不是「一个 Session」：FastAPI 的同步端点在**线程池**里执行，
    长期存活的单个 Session 会被多线程并发使用（Session 不是线程安全的；实测中出现过
    `Session.merge() ... Results may not be consistent` 警告）。

    生命周期由 `dispose()` 收口——应用关闭时调用（见 `api/main.py` 的 lifespan）。
    """
    engine = create_db_engine(url or get_memory_database_url())
    SQLAlchemyMemoryStore.create_all(engine)
    factory = scoped_session(sessionmaker(bind=engine, expire_on_commit=False))
    return SQLAlchemyMemoryStore(factory, engine=engine)
