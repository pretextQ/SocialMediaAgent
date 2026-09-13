"""观测（Observation）领域模型：为「最新快照」表补上**时间序列**能力。

背景与决策见 `docs/adr/0006-time-series.md`：
- `Metric` / `Topic` 的幂等键决定它们是**最新快照**（重复采集覆盖旧值），
  无法回答「某指标 / 话题随时间如何变化」；
- 本模块新增**只追加**的观测模型，与快照表并存：
  快照表继续服务「当前值查询」（既有契约不变），观测表服务「历史序列」。

幂等：观测 id 由业务键**确定性派生**（见 models/observation.py），
同一业务键重复写入收敛为同一条，不会产生重复观测。
"""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator

from .enums import MetricSource, MetricType, Platform


class MetricObservation(BaseModel):
    """一次指标观测（只追加）。字段与 Metric 对齐，但以 observed_at 区分多次观测。"""

    id: str | None = None
    content_id: str | None = None
    account_id: str | None = None
    platform: Platform
    metric_type: MetricType
    value: Decimal
    observed_at: datetime
    source: MetricSource
    raw_value: str | None = None

    @model_validator(mode="after")
    def _require_anchor(self) -> "MetricObservation":
        if not self.content_id and not self.account_id:
            raise ValueError("MetricObservation 必须锚定 content_id 或 account_id 至少一个")
        return self


class TopicObservation(BaseModel):
    """一次话题观测（只追加）：某时刻某关键词的发布量与覆盖平台。"""

    id: str | None = None
    keyword: str
    platforms: list[Platform] = Field(default_factory=list)
    post_count: int = 0
    observed_at: datetime
