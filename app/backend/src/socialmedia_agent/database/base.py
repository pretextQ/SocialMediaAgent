"""SQLAlchemy 声明式基类与通用类型。"""

from datetime import datetime, timezone

from sqlalchemy import DateTime
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.types import TypeDecorator


class Base(DeclarativeBase):
    pass


class UTCDateTime(TypeDecorator):
    """统一以 UTC 存取 datetime。

    SQLite 经 SQLAlchemy 存储 datetime 会丢失时区（读回 naive）。
    本类型在绑定/读取两侧统一按 UTC 处理，保证 round-trip 后仍是 aware UTC。
    未来迁移 PostgreSQL 行为一致。
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
