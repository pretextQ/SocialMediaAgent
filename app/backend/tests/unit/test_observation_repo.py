"""观测 Repository 的单元测试：幂等收敛、序列顺序与过滤。"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, MetricSource, MetricType, Platform
from socialmedia_agent.domain.observation import MetricObservation, TopicObservation
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.observation_repo import (
    MetricObservationRepository,
    TopicObservationRepository,
)

T0 = datetime(2026, 9, 1, tzinfo=timezone.utc)


def _db(tmp_path) -> Database:
    """建库并种下父行。

    观测表对 contents/accounts 有外键（与 metrics 表一致，SQLite 已开
    PRAGMA foreign_keys=ON），因此必须**先有内容再记观测**——
    这也正是 import_csv 的写入顺序（先 upsert 内容，再记观测）。
    """
    db = Database(url=f"sqlite:///{tmp_path / 'obs.db'}")
    db.create_all()
    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="90001", nickname="UP主A")
        )
        ContentRepository(session).upsert(
            Content(
                platform=Platform.BILIBILI,
                platform_content_id="1001",
                account_id="bilibili:90001",
                title="测试内容",
                content_type=ContentType.VIDEO,
            )
        )
    return db


def _metric(observed_at: datetime, value: str = "100", metric_type=MetricType.VIEWS) -> MetricObservation:
    return MetricObservation(
        content_id="bilibili:1001",
        account_id="bilibili:90001",
        platform=Platform.BILIBILI,
        metric_type=metric_type,
        value=Decimal(value),
        observed_at=observed_at,
        source=MetricSource.MANUAL,
    )


def test_metric_observation_record_converges_on_same_key(tmp_path):
    """同一业务键重复写入 -> 只保留一条（幂等收敛）。"""
    db = _db(tmp_path)
    with db.session() as session:
        repo = MetricObservationRepository(session)
        repo.record(_metric(T0))
        repo.record(_metric(T0))
        repo.record(_metric(T0))
        assert repo.count() == 1
    db.engine.dispose()


def test_metric_observation_record_appends_on_new_time(tmp_path):
    """不同观测时间 -> 追加新观测，形成序列。"""
    db = _db(tmp_path)
    with db.session() as session:
        repo = MetricObservationRepository(session)
        repo.record(_metric(T0, value="100"))
        repo.record(_metric(T0 + timedelta(days=7), value="250"))
        assert repo.count() == 2

        series = repo.series(content_id="bilibili:1001", metric_type="views")
        assert [o.value for o in series] == [Decimal("100"), Decimal("250")]
    db.engine.dispose()


def test_metric_observation_series_orders_ascending_and_filters(tmp_path):
    db = _db(tmp_path)
    with db.session() as session:
        repo = MetricObservationRepository(session)
        # 乱序写入，读出来必须按 observed_at 升序
        repo.record(_metric(T0 + timedelta(days=14)))
        repo.record(_metric(T0))
        repo.record(_metric(T0 + timedelta(days=7)))
        repo.record(_metric(T0, metric_type=MetricType.LIKES))

        all_rows = repo.series(content_id="bilibili:1001")
        assert [r.observed_at for r in all_rows] == sorted(r.observed_at for r in all_rows)

        views_only = repo.series(content_id="bilibili:1001", metric_type="views")
        assert len(views_only) == 3

        since = repo.series(content_id="bilibili:1001", since=T0 + timedelta(days=7))
        assert len(since) == 2

        assert repo.series(content_id="bilibili:nope") == []
    db.engine.dispose()


def test_topic_observation_record_and_series(tmp_path):
    db = _db(tmp_path)
    with db.session() as session:
        repo = TopicObservationRepository(session)
        repo.record(
            TopicObservation(
                keyword="AI 绘画", platforms=[Platform.BILIBILI], post_count=30, observed_at=T0
            )
        )
        repo.record(
            TopicObservation(
                keyword="AI 绘画", platforms=[Platform.BILIBILI], post_count=30, observed_at=T0
            )
        )
        assert repo.count() == 1, "同一 keyword + observed_at 必须收敛"

        repo.record(
            TopicObservation(
                keyword="AI 绘画",
                platforms=[Platform.BILIBILI],
                post_count=75,
                observed_at=T0 + timedelta(days=7),
            )
        )
        repo.record(
            TopicObservation(
                keyword="向量检索", platforms=[Platform.BILIBILI], post_count=10, observed_at=T0
            )
        )

        series = repo.series(keyword="AI 绘画")
        assert [r.post_count for r in series] == [30, 75]
        assert len(repo.series(keyword="向量检索")) == 1
        assert repo.series(keyword="不存在") == []
    db.engine.dispose()
