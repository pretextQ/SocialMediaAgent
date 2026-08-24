"""ORM 模型：Metric 映射 domain/metric.py。"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from socialmedia_agent.database.base import Base
from socialmedia_agent.domain.enums import MetricSource, MetricType, Platform
from socialmedia_agent.domain.metric import Metric as MetricDomain


class MetricModel(Base):
    __tablename__ = "metrics"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: uuid.uuid4().hex)
    content_id: Mapped[str | None] = mapped_column(
        String(255), ForeignKey("contents.canonical_id"), nullable=True, index=True
    )
    account_id: Mapped[str | None] = mapped_column(
        String(255), ForeignKey("accounts.canonical_id"), nullable=True, index=True
    )
    platform: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    metric_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    value: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    raw_value: Mapped[str | None] = mapped_column(String(128), nullable=True)

    @classmethod
    def from_domain(cls, metric: MetricDomain) -> "MetricModel":
        return cls(
            id=metric.id,
            content_id=metric.content_id,
            account_id=metric.account_id,
            platform=metric.platform.value,
            metric_type=metric.metric_type.value,
            value=metric.value,
            captured_at=metric.captured_at,
            source=metric.source.value,
            raw_value=metric.raw_value,
        )

    def to_domain(self) -> MetricDomain:
        return MetricDomain(
            id=self.id,
            content_id=self.content_id,
            account_id=self.account_id,
            platform=Platform(self.platform),
            metric_type=MetricType(self.metric_type),
            value=self.value,
            captured_at=self.captured_at,
            source=MetricSource(self.source),
            raw_value=self.raw_value,
        )
