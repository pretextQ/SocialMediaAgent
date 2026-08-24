"""ORM 模型：Topic 映射 domain/topic.py。"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from socialmedia_agent.database.base import UTCDateTime, Base
from socialmedia_agent.domain.enums import Platform
from socialmedia_agent.domain.topic import Topic as TopicDomain


class TopicModel(Base):
    __tablename__ = "topics"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: uuid.uuid4().hex)
    keyword: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    platforms: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    first_seen: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    last_seen: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    post_count: Mapped[int] = mapped_column(nullable=False, default=0)
    summary: Mapped[str | None] = mapped_column(nullable=True)
    sentiment: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    @classmethod
    def from_domain(cls, topic: TopicDomain) -> "TopicModel":
        return cls(
            id=topic.id,
            keyword=topic.keyword,
            title=topic.title,
            platforms=[p.value for p in topic.platforms],
            first_seen=topic.first_seen,
            last_seen=topic.last_seen,
            post_count=topic.post_count,
            summary=topic.summary,
            sentiment=topic.sentiment,
        )

    def to_domain(self) -> TopicDomain:
        return TopicDomain(
            id=self.id,
            keyword=self.keyword,
            title=self.title,
            platforms=[Platform(p) for p in (self.platforms or [])],
            first_seen=self.first_seen,
            last_seen=self.last_seen,
            post_count=self.post_count,
            summary=self.summary,
            sentiment=self.sentiment or {},
        )
