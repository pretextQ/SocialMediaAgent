from sqlalchemy import func, select

from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, Platform
from socialmedia_agent.models import ContentModel, MetricModel
from socialmedia_agent.repositories.content_repo import ContentRepository


def test_content_upsert_idempotent_by_canonical_id(db_session):
    repo = ContentRepository(db_session)
    c1 = Content(
        platform=Platform.BILIBILI, platform_content_id="av1",
        content_type=ContentType.VIDEO, title="旧标题",
    )
    c2 = Content(
        platform=Platform.BILIBILI, platform_content_id="av1",
        content_type=ContentType.VIDEO, title="新标题",
    )
    m1 = repo.upsert(c1)
    m2 = repo.upsert(c2)
    assert m1.id == m2.id
    assert db_session.scalar(select(func.count()).select_from(ContentModel)) == 1
    assert m2.title == "新标题"


def test_content_to_domain_roundtrip(db_session):
    from datetime import datetime, timezone

    repo = ContentRepository(db_session)
    c = Content(
        platform=Platform.BILIBILI, platform_content_id="av2",
        content_type=ContentType.VIDEO, publish_time="2026-08-24T10:00:00Z",
        raw_metadata={"duration": 60},
    )
    repo.upsert(c)
    model = repo.list()[0]
    back = model.to_domain()
    assert back.canonical_id == "bilibili:av2"
    assert back.publish_time == datetime(2026, 8, 24, 10, 0, tzinfo=timezone.utc)
    assert back.raw_metadata == {"duration": 60}
