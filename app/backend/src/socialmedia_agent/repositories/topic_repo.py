"""Topic Repository：以 keyword 幂等 upsert；list 支持平台与时间窗口过滤。

Topic 主要用于 P4 趋势分析与选题推荐。platforms 为 JSON 数组（多平台话题），
platform/since 过滤在 Python 侧完成（避免 JSON contains 的方言差异）。
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select

from socialmedia_agent.domain.topic import Topic as TopicDomain
from socialmedia_agent.models import TopicModel

from .base import BaseRepository


class TopicRepository(BaseRepository):
    model = TopicModel

    def upsert(self, topic: TopicDomain) -> TopicModel:
        existing = self.session.scalar(
            select(TopicModel).where(TopicModel.keyword == topic.keyword)
        )
        if existing is not None:
            self._apply(existing, topic)
            self.session.commit()
            return existing
        model = TopicModel.from_domain(topic)
        self.session.add(model)
        self.session.commit()
        return model

    @staticmethod
    def _apply(model: TopicModel, topic: TopicDomain) -> None:
        model.title = topic.title
        model.platforms = [p.value for p in topic.platforms]
        model.first_seen = topic.first_seen
        model.last_seen = topic.last_seen
        model.post_count = topic.post_count
        model.summary = topic.summary
        model.sentiment = topic.sentiment

    def list(
        self,
        *,
        platform: str | None = None,
        since: datetime | None = None,
        limit: int = 100,
    ) -> list[TopicModel]:
        rows = list(
            self.session.scalars(
                select(TopicModel).order_by(TopicModel.post_count.desc(), TopicModel.id)
            )
        )
        result: list[TopicModel] = []
        for r in rows:
            if since is not None and (r.last_seen is None or r.last_seen < since):
                continue
            if platform is not None and platform not in (r.platforms or []):
                continue
            result.append(r)
            if len(result) >= limit:
                break
        return result
