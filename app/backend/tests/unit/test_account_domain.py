import pytest

from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.enums import OwnerType, Platform


def test_canonical_id_auto_derived():
    acc = Account(platform=Platform.BILIBILI, platform_id="12345")
    assert acc.canonical_id == "bilibili:12345"


def test_canonical_id_overwritten_when_inconsistent():
    acc = Account(platform=Platform.DOUYIN, platform_id="abc", canonical_id="wrong:xyz")
    assert acc.canonical_id == "douyin:abc"


def test_platform_id_containing_colon_is_supported():
    acc = Account(platform=Platform.CHANNELS, platform_id="a:b")
    assert acc.canonical_id == "channels:a:b"


def test_default_owner_type_is_observed():
    acc = Account(platform=Platform.XIAOHONGSHU, platform_id="1")
    assert acc.owner_type == OwnerType.OBSERVED


def test_owner_type_can_be_owner():
    acc = Account(platform=Platform.DOUYIN, platform_id="1", owner_type=OwnerType.OWNER)
    assert acc.owner_type == OwnerType.OWNER


def test_nickname_avatar_optional_and_extra_default():
    acc = Account(platform=Platform.BILIBILI, platform_id="1")
    assert acc.nickname is None
    assert acc.avatar_url is None
    assert acc.extra == {}


def test_extra_preserved():
    acc = Account(platform=Platform.BILIBILI, platform_id="1", extra={"fans": 100})
    assert acc.extra == {"fans": 100}


def test_serialization_roundtrip():
    acc = Account(platform=Platform.KUAISHOU, platform_id="42", nickname="up")
    acc2 = Account(**acc.model_dump())
    assert acc2 == acc


def test_empty_platform_id_rejected():
    with pytest.raises(ValueError):
        Account(platform=Platform.BILIBILI, platform_id="")


def test_invalid_platform_rejected():
    with pytest.raises(ValueError):
        Account(platform="unknown", platform_id="1")
