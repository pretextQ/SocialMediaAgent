"""ORM 模型：Comment 映射 domain/comment.py。"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from socialmedia_agent.database.base import Base
from socialmedia_agent.domain.comment import Comment as CommentDomain
from socialmedia_agent.domain.enums import Platform


class CommentModel(Base):
    __tablename__ = "comments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: uuid.uuid4().hex)
    platform: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    platform_comment_id: Mapped[str] = mapped_column(String(255), nullable=False)
    content_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("contents.canonical_id"), nullable=False, index=True
    )
    parent_comment_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    author_nickname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content: Mapped[str | None] = mapped_column(nullable=True)
    like_count: Mapped[int | None] = mapped_column(nullable=True)
    publish_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @classmethod
    def from_domain(cls, comment: CommentDomain) -> "CommentModel":
        return cls(
            id=comment.id,
            platform=comment.platform.value,
            platform_comment_id=comment.platform_comment_id,
            content_id=comment.content_id,
            parent_comment_id=comment.parent_comment_id,
            author_nickname=comment.author_nickname,
            content=comment.content,
            like_count=comment.like_count,
            publish_time=comment.publish_time,
        )

    def to_domain(self) -> CommentDomain:
        return CommentDomain(
            id=self.id,
            platform=Platform(self.platform),
            platform_comment_id=self.platform_comment_id,
            content_id=self.content_id,
            parent_comment_id=self.parent_comment_id,
            author_nickname=self.author_nickname,
            content=self.content,
            like_count=self.like_count,
            publish_time=self.publish_time,
        )
