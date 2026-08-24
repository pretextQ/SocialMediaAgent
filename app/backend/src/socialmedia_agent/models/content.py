"""ORM 模型：Content 映射 domain/content.py。"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from socialmedia_agent.database.base import UTCDateTime, Base
from socialmedia_agent.domain.content import Content as ContentDomain
from socialmedia_agent.domain.enums import ContentType, Platform


class ContentModel(Base):
    __tablename__ = "contents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: uuid.uuid4().hex)
    canonical_id: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    platform: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    platform_content_id: Mapped[str] = mapped_column(String(255), nullable=False)
    account_id: Mapped[str | None] = mapped_column(
        String(255), ForeignKey("accounts.canonical_id"), nullable=True, index=True
    )
    title: Mapped[str | None] = mapped_column(String(512), nullable=True)
    content: Mapped[str | None] = mapped_column(nullable=True)
    content_type: Mapped[str] = mapped_column(String(16), nullable=False)
    publish_time: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    raw_metadata: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    @classmethod
    def from_domain(cls, content: ContentDomain) -> "ContentModel":
        return cls(
            id=content.id,
            canonical_id=content.canonical_id,
            platform=content.platform.value,
            platform_content_id=content.platform_content_id,
            account_id=content.account_id,
            title=content.title,
            content=content.content,
            content_type=content.content_type.value,
            publish_time=content.publish_time,
            url=content.url,
            raw_metadata=content.raw_metadata,
        )

    def to_domain(self) -> ContentDomain:
        return ContentDomain(
            id=self.id,
            platform=Platform(self.platform),
            platform_content_id=self.platform_content_id,
            account_id=self.account_id,
            title=self.title,
            content=self.content,
            content_type=ContentType(self.content_type),
            publish_time=self.publish_time,
            url=self.url,
            raw_metadata=self.raw_metadata or {},
        )
