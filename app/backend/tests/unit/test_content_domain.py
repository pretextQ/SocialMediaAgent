from datetime import datetime, timezone

import pytest

from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, Platform


def _content(**kw) -> Content:
    defaults = {
        "platform": Platform.BILIBILI,
        "platform_content_id": "av123",
        "content_type": ContentType.VIDEO,
    }
    defaults.update(kw)
    return Content(**defaults)


def test_canonical_id_auto_derived():
    c = _content()
    assert c.canonical_id == "bilibili:av123"


def test_canonical_id_overwritten_when_inconsistent():
    c = _content(platform=Platform.DOUYIN, platform_content_id="abc", canonical_id="wrong:xyz")
    assert c.canonical_id == "douyin:abc"


def test_content_canonical_id_uses_content_id_not_account():
    c = _content(platform=Platform.XIAOHONGSHU, platform_content_id="note1", account_id="xiaohongshu:someone")
    assert c.canonical_id == "xiaohongshu:note1"


def test_account_id_links_to_account_canonical_id():
    c = _content(account_id="bilibili:12345")
    assert c.account_id == "bilibili:12345"


def test_title_and_content_optional():
    c = _content()
    assert c.title is None
    assert c.content is None


def test_publish_time_optional_and_parsed():
    c = _content(publish_time="2026-08-24T10:00:00Z")
    assert c.publish_time == datetime(2026, 8, 24, 10, 0, tzinfo=timezone.utc)


def test_url_optional():
    c = _content()
    assert c.url is None


def test_raw_metadata_default_and_preserved():
    c = _content()
    assert c.raw_metadata == {}
    c2 = _content(raw_metadata={"duration": 60})
    assert c2.raw_metadata == {"duration": 60}


def test_content_type_required():
    with pytest.raises(ValueError):
        Content(platform=Platform.BILIBILI, platform_content_id="av1")


def test_invalid_content_type_rejected():
    with pytest.raises(ValueError):
        _content(content_type="live")


def test_serialization_roundtrip():
    c = _content(title="t", publish_time="2026-08-24T10:00:00Z")
    c2 = Content(**c.model_dump())
    assert c2 == c


def test_empty_platform_content_id_rejected():
    with pytest.raises(ValueError):
        _content(platform_content_id="")
