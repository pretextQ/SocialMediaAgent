from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select

from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, MetricSource, MetricType, Platform
from socialmedia_agent.domain.metric import Metric
from socialmedia_agent.models import ContentModel, MetricModel
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.metric_repo import MetricRepository


def _ensure_content(db_session):
    repo = ContentRepository(db_session)
    repo.upsert(
        Content(
            platform=Platform.BILIBILI,
            platform_content_id="av1",
            content_type=ContentType.VIDEO,
        )
    )


def _metric(value="123", raw="12.3万"):
    return Metric(
        content_id="bilibili:av1",
        platform=Platform.BILIBILI,
        metric_type=MetricType.VIEWS,
        value=Decimal(value),
        captured_at="2026-08-24T10:00:00Z",
        source=MetricSource.MEDIACRAWLER,
        raw_value=raw,
    )


def test_metric_upsert_idempotent_snapshot(db_session):
    _ensure_content(db_session)
    repo = MetricRepository(db_session)
    m1 = repo.upsert(_metric("100", "100"))
    m2 = repo.upsert(_metric("200", "200"))
    assert m1.id == m2.id
    assert db_session.scalar(select(func.count()).select_from(MetricModel)) == 1
    assert m2.value == Decimal("200")
    assert m2.raw_value == "200"


def test_metric_upsert_distinct_by_type(db_session):
    _ensure_content(db_session)
    repo = MetricRepository(db_session)
    repo.upsert(_metric())
    repo.upsert(
        Metric(
            content_id="bilibili:av1",
            platform=Platform.BILIBILI,
            metric_type=MetricType.LIKES,
            value=Decimal("5"),
            captured_at="2026-08-24T10:00:00Z",
            source=MetricSource.MEDIACRAWLER,
        )
    )
    assert db_session.scalar(select(func.count()).select_from(MetricModel)) == 2


def test_metric_to_domain_roundtrip(db_session):
    _ensure_content(db_session)
    repo = MetricRepository(db_session)
    m = _metric()
    repo.upsert(m)
    back = repo.list()[0].to_domain()
    assert back.value == Decimal("123")
    assert back.metric_type == MetricType.VIEWS
    assert back.captured_at == datetime(2026, 8, 24, 10, 0, tzinfo=timezone.utc)
    assert back.raw_value == "12.3万"
