from datetime import datetime, timezone
from decimal import Decimal

import pytest

from socialmedia_agent.domain.enums import MetricSource, MetricType, Platform
from socialmedia_agent.domain.metric import Metric


def _metric(**kw) -> Metric:
    defaults = {
        "platform": Platform.BILIBILI,
        "metric_type": MetricType.VIEWS,
        "value": Decimal("1234"),
        "captured_at": "2026-08-24T10:00:00Z",
        "source": MetricSource.MEDIACRAWLER,
        "content_id": "bilibili:av123",
    }
    defaults.update(kw)
    return Metric(**defaults)


def test_basic_construction():
    m = _metric()
    assert m.value == Decimal("1234")
    assert m.captured_at == datetime(2026, 8, 24, 10, 0, tzinfo=timezone.utc)


def test_value_exact_decimal_precision():
    m = _metric(value=Decimal("12.50"))
    assert m.value == Decimal("12.50")
    assert m.raw_value is None


def test_value_coerced_from_int_and_str():
    assert _metric(value=1000).value == Decimal("1000")
    assert _metric(value="123.45").value == Decimal("123.45")


def test_metric_type_enum_required():
    with pytest.raises(ValueError):
        _metric(metric_type="clicks")


def test_source_enum_required():
    with pytest.raises(ValueError):
        _metric(source="unknown")


def test_anchor_content_id_only():
    m = _metric(content_id="bilibili:av123", account_id=None)
    assert m.content_id == "bilibili:av123"


def test_anchor_account_id_only():
    m = _metric(content_id=None, account_id="bilibili:12345")
    assert m.account_id == "bilibili:12345"


def test_no_anchor_rejected():
    with pytest.raises(ValueError):
        _metric(content_id=None, account_id=None)


def test_raw_value_preserved():
    m = _metric(raw_value="12.3万")
    assert m.raw_value == "12.3万"


def test_serialization_roundtrip():
    m = _metric(raw_value="12.3万")
    m2 = Metric(**m.model_dump())
    assert m2 == m
