from datetime import datetime, timezone
from decimal import Decimal

from socialmedia_agent.connectors.base import RawContent
from socialmedia_agent.connectors.mapper import RawToDomainMapper
from socialmedia_agent.domain.enums import ContentType, MetricSource, MetricType, OwnerType, Platform

_TS = int(datetime(2026, 8, 24, 10, 0, tzinfo=timezone.utc).timestamp())


def _raw(**kw) -> RawContent:
    defaults = {
        "platform": Platform.BILIBILI,
        "platform_id": "1001",
        "account_platform_id": "90001",
        "account_nickname": "UP主A",
        "title": "人工智能入门",
        "content": "教程内容",
        "content_type": ContentType.VIDEO,
        "publish_time": _TS,
        "url": "https://b23.tv/av1001",
        "metrics": {
            MetricType.VIEWS: "12.3万",
            MetricType.LIKES: "1,234",
            MetricType.COMMENTS: "--",
            MetricType.SHARES: "567",
            MetricType.FAVORITES: 890,
        },
    }
    defaults.update(kw)
    return RawContent(**defaults)


def test_mapper_produces_domain_objects():
    account, content, metrics = RawToDomainMapper().map(_raw())

    assert account.canonical_id == "bilibili:90001"
    assert account.owner_type == OwnerType.OBSERVED

    assert content.canonical_id == "bilibili:1001"
    assert content.account_id == account.canonical_id
    assert content.content_type == ContentType.VIDEO
    assert content.publish_time == datetime(2026, 8, 24, 10, 0, tzinfo=timezone.utc)

    assert len(metrics) == 4  # COMMENTS="--" 被跳过
    views = next(m for m in metrics if m.metric_type == MetricType.VIEWS)
    assert views.value == Decimal("123000")
    assert views.source == MetricSource.MEDIACRAWLER
    assert views.raw_value == "12.3万"
    assert views.content_id == "bilibili:1001"
    assert views.account_id == "bilibili:90001"


def test_mapper_account_optional():
    account, content, metrics = RawToDomainMapper().map(_raw(account_platform_id=None))
    assert account is None
    assert content.account_id is None
    assert all(m.account_id is None for m in metrics)


def test_mapper_no_valid_metrics():
    _, _, metrics = RawToDomainMapper().map(_raw(metrics={MetricType.VIEWS: "--"}))
    assert metrics == []


def test_mapper_time_string_iso():
    _, content, _ = RawToDomainMapper().map(_raw(publish_time="2026-08-24T10:00:00Z"))
    assert content.publish_time == datetime(2026, 8, 24, 10, 0, tzinfo=timezone.utc)
