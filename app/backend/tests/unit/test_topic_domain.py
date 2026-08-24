from datetime import datetime, timezone

import pytest

from socialmedia_agent.domain.enums import Platform
from socialmedia_agent.domain.topic import Topic


def _topic(**kw) -> Topic:
    defaults = {"keyword": "人工智能"}
    defaults.update(kw)
    return Topic(**defaults)


def test_basic_construction():
    t = _topic(title="AI 趋势")
    assert t.keyword == "人工智能"
    assert t.title == "AI 趋势"


def test_keyword_required():
    with pytest.raises(ValueError):
        Topic()


def test_platforms_default_empty():
    assert _topic().platforms == []


def test_platforms_accepts_enum_list():
    t = _topic(platforms=[Platform.BILIBILI, Platform.DOUYIN])
    assert t.platforms == [Platform.BILIBILI, Platform.DOUYIN]


def test_invalid_platform_in_list_rejected():
    with pytest.raises(ValueError):
        _topic(platforms=["unknown"])


def test_post_count_default_zero():
    assert _topic().post_count == 0
    assert _topic(post_count=5).post_count == 5


def test_seen_timestamps_optional():
    t = _topic(first_seen="2026-08-01T00:00:00Z", last_seen="2026-08-24T10:00:00Z")
    assert t.first_seen == datetime(2026, 8, 1, tzinfo=timezone.utc)
    assert t.last_seen == datetime(2026, 8, 24, 10, 0, tzinfo=timezone.utc)


def test_sentiment_default_and_preserved():
    assert _topic().sentiment == {}
    t = _topic(sentiment={"positive": 0.8, "negative": 0.2})
    assert t.sentiment == {"positive": 0.8, "negative": 0.2}


def test_summary_optional():
    assert _topic().summary is None
    assert _topic(summary="热度上升").summary == "热度上升"


def test_serialization_roundtrip():
    t = _topic(platforms=[Platform.BILIBILI], post_count=3)
    t2 = Topic(**t.model_dump())
    assert t2 == t
