"""Content Repository：以 canonical_id 幂等 upsert。"""

from __future__ import annotations

from sqlalchemy import select

from socialmedia_agent.domain.content import Content as ContentDomain
from socialmedia_agent.models import ContentModel

from .base import BaseRepository


class ContentRepository(BaseRepository):
    model = ContentModel

    def upsert(self, content: ContentDomain) -> ContentModel:
        existing = self.session.scalar(
            select(ContentModel).where(ContentModel.canonical_id == content.canonical_id)
        )
        if existing is not None:
            self._apply(existing, content)
            self.session.commit()
            return existing
        model = ContentModel.from_domain(content)
        self.session.add(model)
        self.session.commit()
        return model

    @staticmethod
    def _apply(model: ContentModel, content: ContentDomain) -> None:
        model.account_id = content.account_id
        model.title = content.title
        model.content = content.content
        model.content_type = content.content_type.value
        model.publish_time = content.publish_time
        model.url = content.url
        model.raw_metadata = content.raw_metadata
