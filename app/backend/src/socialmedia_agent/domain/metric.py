"""Metric 领域模型（纯 Pydantic，不绑 ORM）。

字段对齐架构定稿：
id, content_id(FK 可空), account_id(FK 可空), platform,
metric_type(views|likes|comments|shares|favorites), value(Numeric),
captured_at, source(mediacrawler|matrixflow|official_api|manual),
raw_value(原串，审计)。

value 使用 Decimal 以精确表达数值（对应架构的 Numeric）。
不同平台口径（如 "12.3万"）由 normalizers 层统一后写入 value（P0.6/P1）。

内容指标必须至少锚定 content_id 或 account_id 之一，保证可关联（P1 DoD）。
"""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, model_validator

from .enums import MetricSource, MetricType, Platform


class Metric(BaseModel):
    id: str | None = None
    content_id: str | None = None
    account_id: str | None = None
    platform: Platform
    metric_type: MetricType
    value: Decimal
    captured_at: datetime
    source: MetricSource
    raw_value: str | None = None

    @model_validator(mode="after")
    def _require_anchor(self) -> "Metric":
        if not self.content_id and not self.account_id:
            raise ValueError("Metric 必须锚定 content_id 或 account_id 至少一个")
        return self
