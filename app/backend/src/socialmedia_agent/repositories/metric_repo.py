"""Metric Repository：以 (锚点, metric_type, source) 幂等 upsert。

指标是"最新快照"语义：同一内容 + 同一指标类型重复采集时更新为最新值，
避免重复行（P1 幂等 DoD）。
"""

from __future__ import annotations

from sqlalchemy import select

from socialmedia_agent.domain.metric import Metric as MetricDomain
from socialmedia_agent.models import MetricModel

from .base import BaseRepository


class MetricRepository(BaseRepository):
    model = MetricModel

    def upsert(self, metric: MetricDomain) -> MetricModel:
        existing = self.session.scalar(
            select(MetricModel).where(
                MetricModel.content_id == metric.content_id,
                MetricModel.account_id == metric.account_id,
                MetricModel.metric_type == metric.metric_type.value,
                MetricModel.source == metric.source.value,
            )
        )
        if existing is not None:
            existing.value = metric.value
            existing.captured_at = metric.captured_at
            existing.raw_value = metric.raw_value
            self.session.commit()
            return existing
        model = MetricModel.from_domain(metric)
        self.session.add(model)
        self.session.commit()
        return model
