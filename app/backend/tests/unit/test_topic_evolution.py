"""话题演变信号测试（读侧，见 docs/adr/0006-time-series.md）。

两层：
1. topic_evolution 纯函数 —— 方向判定与阈值；
2. get_trend_data Tool 端到端 —— 演变信号确实由**观测表**驱动，
   且「没有观测」与「持平」是两件不同的事。
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from socialmedia_agent.agents.tools.catalog import (
    EVOLUTION_STABLE_THRESHOLD_PCT,
    build_registry,
    topic_evolution,
)
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.enums import Platform
from socialmedia_agent.domain.observation import TopicObservation
from socialmedia_agent.domain.topic import Topic
from socialmedia_agent.repositories.observation_repo import TopicObservationRepository
from socialmedia_agent.repositories.topic_repo import TopicRepository

T0 = datetime(2026, 9, 1, tzinfo=timezone.utc)
T1 = T0 + timedelta(days=7)


# ---------------------------------------------------------------------------
# 纯函数
# ---------------------------------------------------------------------------


def test_no_observations_yields_unknown_direction():
    """没有观测 -> direction=None。

    这与「持平」必须区分：没观测是「不知道」，持平是「量过了，没变」。
    """
    assert topic_evolution([]) == {
        "direction": None,
        "change_pct": None,
        "observation_count": 0,
    }


def test_single_observation_is_new_not_stable():
    """只有一次观测 -> new，绝不谎报方向。"""
    result = topic_evolution([(100, T0)])
    assert result["direction"] == "new"
    assert result["change_pct"] is None
    assert result["observation_count"] == 1


def test_rising_and_fading_beyond_threshold():
    rising = topic_evolution([(100, T0), (150, T1)])
    assert rising["direction"] == "rising"
    assert rising["change_pct"] == 50.0

    fading = topic_evolution([(100, T0), (60, T1)])
    assert fading["direction"] == "fading"
    assert fading["change_pct"] == -40.0


def test_small_change_is_stable():
    """幅度在阈值内视为持平，避免把噪声读成趋势。"""
    within = topic_evolution([(100, T0), (100 + EVOLUTION_STABLE_THRESHOLD_PCT, T1)])
    assert within["direction"] == "stable"


def test_zero_previous_yields_rising_without_pct():
    """上期为 0：方向可判（rising），但增长率没有定义 -> change_pct=None。"""
    result = topic_evolution([(0, T0), (80, T1)])
    assert result["direction"] == "rising"
    assert result["change_pct"] is None
    assert result["observation_count"] == 2


def test_only_last_two_points_are_compared():
    """刻意只比最近两次：三点拟合需要更密采样，当前数据不支持。"""
    result = topic_evolution([(10, T0), (500, T0 + timedelta(days=1)), (520, T1)])
    assert result["direction"] == "stable"
    assert result["observation_count"] == 3


def test_points_are_sorted_by_time_not_input_order():
    """乱序传入也按时间排序比较（写入顺序不应影响结论）。"""
    result = topic_evolution([(150, T1), (100, T0)])
    assert result["direction"] == "rising"
    assert result["change_pct"] == 50.0


# ---------------------------------------------------------------------------
# Tool 端到端：演变信号必须来自观测表
# ---------------------------------------------------------------------------


def _registry_with_topic(tmp_path, observations: list[tuple[int, datetime]]):
    db = Database(url=f"sqlite:///{tmp_path / 'evo.db'}")
    db.create_all()
    with db.session() as session:
        TopicRepository(session).upsert(
            Topic(
                keyword="AI 绘画",
                platforms=[Platform.BILIBILI],
                post_count=observations[-1][0] if observations else 0,
                last_seen=datetime.now(timezone.utc),
            )
        )
        repo = TopicObservationRepository(session)
        for post_count, observed_at in observations:
            repo.record(
                TopicObservation(
                    keyword="AI 绘画",
                    platforms=[Platform.BILIBILI],
                    post_count=post_count,
                    observed_at=observed_at,
                )
            )
    return db, build_registry(db)


def test_trend_data_reports_unknown_without_observations(tmp_path):
    """只有快照、没有观测 -> direction 为 None（诚实，不猜）。"""
    db, registry = _registry_with_topic(tmp_path, [])
    rows = registry.invoke("get_trend_data", platform="bilibili", period=30)
    assert len(rows) == 1
    assert rows[0]["direction"] is None
    assert rows[0]["observation_count"] == 0
    db.engine.dispose()


def test_trend_data_reports_rising_from_observations(tmp_path):
    db, registry = _registry_with_topic(tmp_path, [(100, T0), (150, T1)])
    rows = registry.invoke("get_trend_data", platform="bilibili", period=30)
    assert rows[0]["direction"] == "rising"
    assert rows[0]["change_pct"] == 50.0
    assert rows[0]["observation_count"] == 2
    db.engine.dispose()


def test_trend_data_reports_fading_from_observations(tmp_path):
    db, registry = _registry_with_topic(tmp_path, [(100, T0), (40, T1)])
    rows = registry.invoke("get_trend_data", platform="bilibili", period=30)
    assert rows[0]["direction"] == "fading"
    assert rows[0]["change_pct"] == -60.0
    db.engine.dispose()
