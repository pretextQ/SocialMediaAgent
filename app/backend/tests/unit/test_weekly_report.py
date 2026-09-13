"""周报服务测试（TDD，P5-2）。

覆盖：
- build_weekly_report：聚合近 N 天内容数/播放量（按 publish_time 过滤旧内容）
- 复用诊断与策略 Agent，产出健康度/策略摘要
- render_weekly_report：markdown 包含昵称与统计数字
- generate_all_weekly_reports：为全部账号写文件
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import pytest

from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, MetricSource, MetricType, Platform
from socialmedia_agent.domain.metric import Metric
from socialmedia_agent.memory.store import build_memory_store
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.metric_repo import MetricRepository

NOW = datetime.now(timezone.utc)


def seed_db(tmp_path) -> Database:
    db = Database(url=f"sqlite:///{tmp_path / 'wr.db'}")
    db.create_all()
    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="90001", nickname="UP主A")
        )
        AccountRepository(session).upsert(
            Account(platform=Platform.WEIBO, platform_id="90002", nickname="微博博主B")
        )
        c1 = ContentRepository(session).upsert(
            Content(
                platform=Platform.BILIBILI,
                platform_content_id="1001",
                account_id="bilibili:90001",
                title="本周内容",
                content_type=ContentType.VIDEO,
                publish_time=NOW - timedelta(days=1),
            )
        )
        c_old = ContentRepository(session).upsert(
            Content(
                platform=Platform.BILIBILI,
                platform_content_id="1002",
                account_id="bilibili:90001",
                title="旧内容",
                content_type=ContentType.VIDEO,
                publish_time=NOW - timedelta(days=30),
            )
        )
        for cid, views in ((c1.canonical_id, "1000"), (c_old.canonical_id, "9999")):
            MetricRepository(session).upsert(
                Metric(
                    content_id=cid,
                    account_id="bilibili:90001",
                    platform=Platform.BILIBILI,
                    metric_type=MetricType.VIEWS,
                    value=views,
                    captured_at=NOW,
                    source=MetricSource.MEDIACRAWLER,
                )
            )
    return db


def make_memory(tmp_path):
    return build_memory_store(url=f"sqlite:///{tmp_path / 'mem.db'}")


def test_build_weekly_report_aggregates_weekly(tmp_path):
    from socialmedia_agent.services.weekly_report import build_weekly_report

    db = seed_db(tmp_path)
    mem = make_memory(tmp_path)
    summary = build_weekly_report(db, mem, "bilibili:90001")
    assert summary["nickname"] == "UP主A"
    assert summary["platform"] == "bilibili"
    assert summary["content_count"] == 1  # 30 天前的旧内容被排除
    assert Decimal(summary["total_views"]) == Decimal("1000")
    assert 0 <= summary["health"] <= 100
    assert summary["strategy_summary"]


def test_render_weekly_report_markdown(tmp_path):
    from socialmedia_agent.services.weekly_report import build_weekly_report, render_weekly_report

    db = seed_db(tmp_path)
    mem = make_memory(tmp_path)
    summary = build_weekly_report(db, mem, "bilibili:90001")
    report = render_weekly_report(summary)
    assert "运营周报：UP主A" in report
    assert "1 条" in report
    assert "1000" in report


def test_generate_all_weekly_reports_writes_files(tmp_path):
    from socialmedia_agent.services.weekly_report import generate_all_weekly_reports

    db = seed_db(tmp_path)
    mem = make_memory(tmp_path)
    report_dir = tmp_path / "reports"
    written = generate_all_weekly_reports(db, mem, str(report_dir))
    assert len(written) == 2
    assert all(Path(p).exists() for p in written)


def test_generate_all_weekly_reports_defaults_to_settings_dir(tmp_path, monkeypatch):
    """report_dir 省略时回落到 Settings.report_dir。

    读侧 GET /api/v1/reports 读的就是这个目录；两边不一致会让周报「写了却读不到」。
    """
    from types import SimpleNamespace

    from socialmedia_agent.services import weekly_report as wr

    db = seed_db(tmp_path)
    mem = make_memory(tmp_path)
    target = tmp_path / "reports_from_settings"
    monkeypatch.setattr(wr, "get_settings", lambda: SimpleNamespace(report_dir=str(target)))

    written = wr.generate_all_weekly_reports(db, mem)

    assert len(written) == 2
    assert all(Path(p).exists() for p in written)
    assert all(Path(p).parent == target for p in written)


# ---- 投递旁路（P7） ----


def test_generate_all_weekly_reports_dispatches_to_notifiers(tmp_path):
    """配置了通道时，每篇周报生成后都会被投递；投递内容与落盘内容一致。"""
    from socialmedia_agent.services import weekly_report as wr
    from socialmedia_agent.services.notifier import Notifier, NotifierRegistry

    sent: list[tuple[str, str]] = []

    class _Recorder(Notifier):
        name = "recorder"

        def send(self, *, title: str, markdown: str) -> bool:
            sent.append((title, markdown))
            return True

    db = seed_db(tmp_path)
    mem = make_memory(tmp_path)
    written = wr.generate_all_weekly_reports(
        db, mem, str(tmp_path / "reports"), notifiers=NotifierRegistry([_Recorder()])
    )

    assert len(written) == 2
    assert len(sent) == 2
    for name, markdown in sent:
        assert name.startswith("weekly_")
        assert markdown.startswith("# 运营周报")


def test_generate_all_weekly_reports_without_notifiers_still_writes_files(tmp_path):
    """不传 notifiers 时行为不变（只有落盘），保证向后兼容。"""
    from socialmedia_agent.services.weekly_report import generate_all_weekly_reports

    db = seed_db(tmp_path)
    mem = make_memory(tmp_path)
    written = generate_all_weekly_reports(db, mem, str(tmp_path / "reports"))

    assert len(written) == 2
    assert all(Path(p).exists() for p in written)


# ---- 环比（对比上一个等长周期） ----


def test_build_weekly_report_computes_period_over_period(tmp_path):
    """本期 2 条 / 播放 200，上期 1 条 / 播放 50 -> 内容 +100%、播放 +300%。"""
    from socialmedia_agent.services.weekly_report import build_weekly_report

    db = Database(url=f"sqlite:///{tmp_path / 'pop.db'}")
    db.create_all()
    now = datetime.now(timezone.utc)

    def add(platform_content_id: str, days_ago: int, views: str) -> None:
        with db.session() as session:
            c = ContentRepository(session).upsert(
                Content(
                    platform=Platform.BILIBILI,
                    platform_content_id=platform_content_id,
                    account_id="bilibili:95001",
                    title=platform_content_id,
                    content_type=ContentType.VIDEO,
                    publish_time=now - timedelta(days=days_ago),
                )
            )
            MetricRepository(session).upsert(
                Metric(
                    content_id=c.canonical_id,
                    account_id="bilibili:95001",
                    platform=Platform.BILIBILI,
                    metric_type=MetricType.VIEWS,
                    value=views,
                    captured_at=now,
                    source=MetricSource.MEDIACRAWLER,
                )
            )

    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="95001", nickname="环比UP")
        )
    add("cur-1", 1, "100")  # 本期
    add("cur-2", 3, "100")  # 本期
    add("prev-1", 10, "50")  # 上一周期（7~14 天前）

    summary = build_weekly_report(db, make_memory(tmp_path), "bilibili:95001")

    assert summary["content_count"] == 2
    assert summary["previous_content_count"] == 1
    assert Decimal(summary["total_views"]) == Decimal("200")
    assert Decimal(summary["previous_total_views"]) == Decimal("50")
    assert summary["content_count_change_pct"] == pytest.approx(100.0)
    assert summary["total_views_change_pct"] == pytest.approx(300.0)


def test_build_weekly_report_change_pct_is_none_without_previous(tmp_path):
    """上期无数据时环比必须是 None，且报告里明确说明无法计算。

    刻意不返回 0 或 +100%：上期没有数据时「增长率」没有定义，
    给一个具体数字比留空更误导。
    """
    from socialmedia_agent.services.weekly_report import (
        build_weekly_report,
        render_weekly_report,
    )

    db = seed_db(tmp_path)  # 种子里上期窗口内没有内容
    summary = build_weekly_report(db, make_memory(tmp_path), "bilibili:90001")

    assert summary["previous_content_count"] == 0
    assert summary["content_count_change_pct"] is None
    assert summary["total_views_change_pct"] is None

    report = render_weekly_report(summary)
    assert "环比" in report
    assert "无法计算" in report
