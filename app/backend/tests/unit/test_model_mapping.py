"""ORM 映射往返：重点覆盖时区时间与 Decimal 精度经 SQLite 不丢失。"""

from decimal import Decimal

from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, MetricSource, MetricType, Platform
from socialmedia_agent.domain.metric import Metric
from socialmedia_agent.models import ContentModel, MetricModel


def test_content_publish_time_tz_roundtrip(db_session):
    c = Content(
        platform=Platform.BILIBILI,
        platform_content_id="av1",
        content_type=ContentType.VIDEO,
        publish_time="2026-08-24T10:00:00Z",
        url="https://example.com/av1",
        raw_metadata={"duration": 60},
    )
    model = ContentModel.from_domain(c)
    db_session.add(model)
    db_session.commit()
    got = db_session.get(ContentModel, model.id)
    back = got.to_domain()
    assert back.publish_time == c.publish_time
    assert back.platform == Platform.BILIBILI
    assert back.canonical_id == "bilibili:av1"
    assert back.raw_metadata == {"duration": 60}


def test_metric_decimal_value_roundtrip(db_session):
    content = Content(
        platform=Platform.BILIBILI,
        platform_content_id="av1",
        content_type=ContentType.VIDEO,
    )
    db_session.add(ContentModel.from_domain(content))
    db_session.commit()

    m = Metric(
        content_id="bilibili:av1",
        platform=Platform.BILIBILI,
        metric_type=MetricType.VIEWS,
        value=Decimal("123456.5"),
        captured_at="2026-08-24T10:00:00Z",
        source=MetricSource.MEDIACRAWLER,
        raw_value="12.3万",
    )
    model = MetricModel.from_domain(m)
    db_session.add(model)
    db_session.commit()
    got = db_session.get(MetricModel, model.id)
    back = got.to_domain()
    assert back.value == Decimal("123456.5")
    assert back.metric_type == MetricType.VIEWS
    assert back.raw_value == "12.3万"
