"""观测 Repository：只追加的时间序列读写（见 docs/adr/0006-time-series.md）。

- `record`：按确定性 id **幂等收敛** —— 同一业务键重复写入不产生新行；
- `series`：按 `observed_at` 升序返回序列，支持锚点 / 指标类型 / 时间下界过滤。

与快照 Repository 的关系：快照表继续服务「当前值查询」，本表只服务「历史序列」，
两者互不写入对方，避免「读快照时顺手改历史」这类隐式耦合。
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import select

from socialmedia_agent.domain.observation import (
    MetricObservation as MetricObservationDomain,
)
from socialmedia_agent.domain.observation import (
    TopicObservation as TopicObservationDomain,
)
from socialmedia_agent.models.observation import (
    MetricObservationModel,
    TopicObservationModel,
)

from .base import BaseRepository


class MetricObservationRepository(BaseRepository):
    model = MetricObservationModel

    def record(self, observation: MetricObservationDomain) -> MetricObservationModel:
        """写入一次指标观测（确定性 id，重复写入收敛为同一条）。"""
        model = MetricObservationModel.from_domain(observation)
        merged = self.session.merge(model)
        self.session.commit()
        return merged

    def series(
        self,
        *,
        content_id: str | None = None,
        account_id: str | None = None,
        metric_type: str | None = None,
        since: datetime | None = None,
        limit: int = 1000,
    ) -> list[MetricObservationModel]:
        stmt = select(MetricObservationModel)
        if content_id is not None:
            stmt = stmt.where(MetricObservationModel.content_id == content_id)
        if account_id is not None:
            stmt = stmt.where(MetricObservationModel.account_id == account_id)
        if metric_type is not None:
            stmt = stmt.where(MetricObservationModel.metric_type == metric_type)
        if since is not None:
            stmt = stmt.where(MetricObservationModel.observed_at >= since)
        stmt = stmt.order_by(MetricObservationModel.observed_at).limit(limit)
        return list(self.session.scalars(stmt))


class TopicObservationRepository(BaseRepository):
    model = TopicObservationModel

    def record(self, observation: TopicObservationDomain) -> TopicObservationModel:
        """写入一次话题观测（确定性 id，重复写入收敛为同一条）。"""
        model = TopicObservationModel.from_domain(observation)
        merged = self.session.merge(model)
        self.session.commit()
        return merged

    def series(
        self,
        *,
        keyword: str | None = None,
        since: datetime | None = None,
        limit: int = 1000,
    ) -> list[TopicObservationModel]:
        stmt = select(TopicObservationModel)
        if keyword is not None:
            stmt = stmt.where(TopicObservationModel.keyword == keyword)
        if since is not None:
            stmt = stmt.where(TopicObservationModel.observed_at >= since)
        stmt = stmt.order_by(TopicObservationModel.observed_at).limit(limit)
        return list(self.session.scalars(stmt))
