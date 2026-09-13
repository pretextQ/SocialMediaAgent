"""ORM 模型：观测表（只追加的时间序列，见 docs/adr/0006-time-series.md）。

id 由业务键**确定性派生**（sha256 前 32 位），因此：
- 同一业务键重复写入 = 同一个 id = 幂等收敛，不产生重复观测；
- 不同 observed_at 是不同观测，天然形成序列。

为何用确定性主键而不是 UniqueConstraint：SQLite 下 NULL 在唯一约束中互不相等，
而 content_id / account_id 可空，组合唯一键会漏掉 NULL 参与的去重。
"""

from __future__ import annotations

import hashlib
from datetime import datetime
from decimal import Decimal

from sqlalchemy import JSON, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from socialmedia_agent.database.base import UTCDateTime, Base
from socialmedia_agent.domain.enums import MetricSource, MetricType, Platform
from socialmedia_agent.domain.observation import (
    MetricObservation as MetricObservationDomain,
)
from socialmedia_agent.domain.observation import (
    TopicObservation as TopicObservationDomain,
)


def _digest(*parts: object) -> str:
    """把业务键拼成确定性 id（None 归一为空串，避免 "None" 与空串撞车）。"""
    raw = "|".join("" if part is None else str(part) for part in parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


class MetricObservationModel(Base):
    __tablename__ = "metric_observations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    content_id: Mapped[str | None] = mapped_column(
        String(255), ForeignKey("contents.canonical_id"), nullable=True, index=True
    )
    account_id: Mapped[str | None] = mapped_column(
        String(255), ForeignKey("accounts.canonical_id"), nullable=True, index=True
    )
    platform: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    metric_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    value: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    observed_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    raw_value: Mapped[str | None] = mapped_column(String(128), nullable=True)

    @staticmethod
    def make_id(obs: MetricObservationDomain) -> str:
        return _digest(
            obs.content_id, obs.account_id, obs.metric_type.value,
            obs.source.value, obs.observed_at.isoformat(),
        )

    @classmethod
    def from_domain(cls, obs: MetricObservationDomain) -> "MetricObservationModel":
        return cls(
            id=obs.id or cls.make_id(obs),
            content_id=obs.content_id,
            account_id=obs.account_id,
            platform=obs.platform.value,
            metric_type=obs.metric_type.value,
            value=obs.value,
            observed_at=obs.observed_at,
            source=obs.source.value,
            raw_value=obs.raw_value,
        )

    def to_domain(self) -> MetricObservationDomain:
        return MetricObservationDomain(
            id=self.id,
            content_id=self.content_id,
            account_id=self.account_id,
            platform=Platform(self.platform),
            metric_type=MetricType(self.metric_type),
            value=self.value,
            observed_at=self.observed_at,
            source=MetricSource(self.source),
            raw_value=self.raw_value,
        )


class TopicObservationModel(Base):
    __tablename__ = "topic_observations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    keyword: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    platforms: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    post_count: Mapped[int] = mapped_column(nullable=False, default=0)
    observed_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False, index=True)

    @staticmethod
    def make_id(obs: TopicObservationDomain) -> str:
        return _digest(obs.keyword, obs.observed_at.isoformat())

    @classmethod
    def from_domain(cls, obs: TopicObservationDomain) -> "TopicObservationModel":
        return cls(
            id=obs.id or cls.make_id(obs),
            keyword=obs.keyword,
            platforms=[p.value for p in obs.platforms],
            post_count=obs.post_count,
            observed_at=obs.observed_at,
        )

    def to_domain(self) -> TopicObservationDomain:
        return TopicObservationDomain(
            id=self.id,
            keyword=self.keyword,
            platforms=[Platform(p) for p in (self.platforms or [])],
            post_count=self.post_count,
            observed_at=self.observed_at,
        )
