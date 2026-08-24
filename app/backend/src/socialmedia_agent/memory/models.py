"""Memory 领域模型（账号历史运营特征，P2-3）。

与 RAG（运营知识）严格区分：Memory 记录的是某个账号的历史运营特征，
如内容定位、高/低表现内容类型、历史运营策略、策略执行结果、账号长期特征。
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field


class MemoryCategory(str, Enum):
    POSITIONING = "positioning"          # 内容定位
    HIGH_PERFORMANCE = "high_performance"  # 高表现内容类型
    LOW_PERFORMANCE = "low_performance"    # 低表现内容类型
    STRATEGY = "strategy"                # 历史运营策略
    RESULT = "result"                    # 策略执行结果
    LONGTERM = "longterm"                # 账号长期特征


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


class MemoryEntry(BaseModel):
    """一条账号历史运营特征记录。"""

    account_id: str  # canonical_id
    category: MemoryCategory
    content: str
    created_at: datetime = Field(default_factory=_now_utc)
    expires_at: datetime | None = None
    id: str | None = None

    @property
    def expired(self) -> bool:
        if self.expires_at is None:
            return False
        return _now_utc() > self.expires_at
