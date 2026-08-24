from datetime import datetime, timezone

import pytest

from socialmedia_agent.domain.comment import Comment
from socialmedia_agent.domain.enums import Platform


def _comment(**kw) -> Comment:
    defaults = {
        "platform": Platform.BILIBILI,
        "platform_comment_id": "c1",
        "content_id": "bilibili:av123",
    }
    defaults.update(kw)
    return Comment(**defaults)


def test_basic_construction():
    c = _comment(author_nickname="u1", content="不错", like_count=5)
    assert c.platform == Platform.BILIBILI
    assert c.platform_comment_id == "c1"
    assert c.content_id == "bilibili:av123"


def test_platform_comment_id_required():
    with pytest.raises(ValueError):
        _comment(platform_comment_id=None)


def test_content_id_required():
    with pytest.raises(ValueError):
        _comment(content_id=None)


def test_parent_comment_id_optional():
    assert _comment().parent_comment_id is None
    c = _comment(parent_comment_id="c0")
    assert c.parent_comment_id == "c0"


def test_author_nickname_and_content_optional():
    c = _comment()
    assert c.author_nickname is None
    assert c.content is None


def test_like_count_optional_int():
    assert _comment().like_count is None
    assert _comment(like_count=0).like_count == 0


def test_publish_time_parsed():
    c = _comment(publish_time="2026-08-24T10:00:00Z")
    assert c.publish_time == datetime(2026, 8, 24, 10, 0, tzinfo=timezone.utc)


def test_invalid_platform_rejected():
    with pytest.raises(ValueError):
        _comment(platform="unknown")


def test_serialization_roundtrip():
    c = _comment(author_nickname="u1", like_count=3, publish_time="2026-08-24T10:00:00Z")
    c2 = Comment(**c.model_dump())
    assert c2 == c
