"""观测（时间序列）领域模型与确定性 id 的单元测试。

见 docs/adr/0006-time-series.md：观测 id 由业务键确定性派生，
这是「重复写入收敛」与「不同时间形成序列」两件事能同时成立的关键。
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

import pytest
from pydantic import ValidationError

from socialmedia_agent.domain.enums import MetricSource, MetricType, Platform
from socialmedia_agent.domain.observation import MetricObservation, TopicObservation
from socialmedia_agent.models.observation import MetricObservationModel, TopicObservationModel

T0 = datetime(2026, 9, 1, tzinfo=timezone.utc)
T1 = datetime(2026, 9, 8, tzinfo=timezone.utc)


def _metric(observed_at: datetime = T0, value: str = "100") -> MetricObservation:
    return MetricObservation(
        content_id="bilibili:1001",
        account_id="bilibili:90001",
        platform=Platform.BILIBILI,
        metric_type=MetricType.VIEWS,
        value=Decimal(value),
        observed_at=observed_at,
        source=MetricSource.MANUAL,
        raw_value="1.2万",
    )


def test_metric_observation_requires_anchor():
    """必须锚定 content_id 或 account_id 至少一个（与 Metric 一致）。"""
    with pytest.raises(ValidationError):
        MetricObservation(
            platform=Platform.BILIBILI,
            metric_type=MetricType.VIEWS,
            value=Decimal("1"),
            observed_at=T0,
            source=MetricSource.MANUAL,
        )


def test_metric_observation_id_is_deterministic():
    """同业务键 -> 同 id；不同 observed_at -> 不同 id。"""
    a = MetricObservationModel.make_id(_metric(T0))
    b = MetricObservationModel.make_id(_metric(T0, value="999"))  # value 不参与键
    c = MetricObservationModel.make_id(_metric(T1))

    assert a == b, "value 变化不应改变观测身份（同一时刻同一指标只应有一条）"
    assert a != c, "不同观测时间必须是不同观测"
    assert len(a) == 32


def test_metric_observation_id_distinguishes_metric_type_and_source():
    base = _metric()
    other_type = base.model_copy(update={"metric_type": MetricType.LIKES})
    other_source = base.model_copy(update={"source": MetricSource.MEDIACRAWLER})

    assert MetricObservationModel.make_id(base) != MetricObservationModel.make_id(other_type)
    assert MetricObservationModel.make_id(base) != MetricObservationModel.make_id(other_source)


def test_metric_observation_none_does_not_collide_with_literal_none():
    """None 必须与**字面量字符串 "None"** 区分。

    朴素的 "|".join(str(p) for p in parts) 会把 None 和 "None" 拼成同一串；
    _digest 把 None 归一为空串来避免这个坑。
    （副作用：None 与空串被视为同一键——本项目 account_id 只会是真实 id 或 None，
    不会出现空串，因此这是可接受的取舍。）
    """
    base = _metric()
    with_none = base.model_copy(update={"account_id": None})
    with_literal = base.model_copy(update={"account_id": "None"})

    assert MetricObservationModel.make_id(with_none) != MetricObservationModel.make_id(with_literal)


def test_topic_observation_id_is_deterministic():
    first = TopicObservation(keyword="AI 绘画", platforms=[Platform.BILIBILI], post_count=30, observed_at=T0)
    same = TopicObservation(keyword="AI 绘画", platforms=[Platform.XIAOHONGSHU], post_count=99, observed_at=T0)
    later = TopicObservation(keyword="AI 绘画", platforms=[Platform.BILIBILI], post_count=30, observed_at=T1)

    assert TopicObservationModel.make_id(first) == TopicObservationModel.make_id(same)
    assert TopicObservationModel.make_id(first) != TopicObservationModel.make_id(later)


def test_observation_round_trip_to_domain():
    model = MetricObservationModel.from_domain(_metric())
    restored = model.to_domain()
    assert restored.content_id == "bilibili:1001"
    assert restored.metric_type is MetricType.VIEWS
    assert restored.source is MetricSource.MANUAL
    assert restored.observed_at == T0
    assert restored.value == Decimal("100")
