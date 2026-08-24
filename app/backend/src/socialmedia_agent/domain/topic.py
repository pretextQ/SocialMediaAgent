"""Topic 领域模型（纯 Pydantic，不绑 ORM）。

字段对齐架构定稿：
id, keyword, title, platforms, first_seen, last_seen, post_count,
summary, sentiment(JSON/文本)。

主要用于 P4 趋势分析与选题推荐。
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from .enums import Platform


class Topic(BaseModel):
    id: str | None = None
    keyword: str
    title: str | None = None
    platforms: list[Platform] = Field(default_factory=list)
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    post_count: int = 0
    summary: str | None = None
    sentiment: dict[str, Any] = Field(default_factory=dict)
