from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select

from socialmedia_agent.connectors.base import RawContent
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.enums import ContentType, MetricType, Platform
from socialmedia_agent.models import AccountModel, ContentModel, MetricModel
from socialmedia_agent.services.ingest import IngestService


class FakeConnector:
    def __init__(self, raws):
        self.raws = raws
        self.calls = []

    def search(self, keyword, platform="bili", limit=10):
        self.calls.append((keyword, platform, limit))
        return self.raws


def _raw(platform_id, views):
    return RawContent(
        platform=Platform.BILIBILI,
        platform_id=platform_id,
        account_platform_id="90001",
        account_nickname="UP主A",
        title=f"视频{platform_id}",
        content="内容",
        content_type=ContentType.VIDEO,
        publish_time=int(datetime(2026, 8, 24, 10, 0, tzinfo=timezone.utc).timestamp()),
        url=f"https://b23.tv/av{platform_id}",
        metrics={MetricType.VIEWS: views, MetricType.LIKES: "--"},
    )


def _db(tmp_path) -> Database:
    db = Database(url=f"sqlite:///{tmp_path / 'sma.db'}")
    db.create_all()
    return db


def test_ingest_search_persists_unified_models(tmp_path):
    db = _db(tmp_path)
    service = IngestService(connector=FakeConnector([_raw("1001", "12.3万")]), database=db)
    result = service.ingest_search("人工智能", platform="bili", limit=5)

    assert result.content_count == 1
    assert result.account_count == 1
    assert result.metric_count == 1  # LIKES="--" 被跳过

    with db.session() as session:
        account = session.scalar(select(AccountModel))
        content = session.scalar(select(ContentModel))
        metric = session.scalar(select(MetricModel))
        assert account.canonical_id == "bilibili:90001"
        assert content.canonical_id == "bilibili:1001"
        assert content.account_id == account.canonical_id
        assert metric.content_id == content.canonical_id
        assert metric.account_id == account.canonical_id
        assert metric.value == Decimal("123000")
        assert metric.raw_value == "12.3万"
    db.engine.dispose()


def test_ingest_search_idempotent_on_rerun(tmp_path):
    db = _db(tmp_path)
    connector = FakeConnector([_raw("1001", "12.3万")])
    service = IngestService(connector=connector, database=db)
    service.ingest_search("人工智能")
    service.ingest_search("人工智能")

    with db.session() as session:
        assert session.scalar(select(func.count()).select_from(AccountModel)) == 1
        assert session.scalar(select(func.count()).select_from(ContentModel)) == 1
        assert session.scalar(select(func.count()).select_from(MetricModel)) == 1
    db.engine.dispose()


def test_ingest_search_updates_snapshot_on_rerun(tmp_path):
    db = _db(tmp_path)
    connector = FakeConnector([_raw("1001", "100")])
    service = IngestService(connector=connector, database=db)
    service.ingest_search("人工智能")
    connector.raws = [_raw("1001", "500")]
    result = service.ingest_search("人工智能")

    assert result.metric_count == 1
    with db.session() as session:
        assert session.scalar(select(func.count()).select_from(MetricModel)) == 1
        metric = session.scalar(select(MetricModel))
        assert metric.value == Decimal("500")
    db.engine.dispose()
