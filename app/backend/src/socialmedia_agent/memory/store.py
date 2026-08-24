"""Memory 存储：账号历史运营特征独立持久化（独立 DB，与 RAG 物理分离）。"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from socialmedia_agent.database.base import UTCDateTime
from socialmedia_agent.database.engine import create_db_engine
from socialmedia_agent.memory.models import MemoryCategory, MemoryEntry


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
    def __init__(self, session):
        self.session = session

    @staticmethod
    def create_all(engine) -> None:
        MemoryBase.metadata.create_all(engine)

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
