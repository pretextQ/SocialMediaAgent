from datetime import datetime, timezone
from decimal import Decimal

from socialmedia_agent.domain.enums import Platform
from socialmedia_agent.normalizers import (
    DefaultNumberNormalizer,
    DefaultTimeNormalizer,
    NormalizerRegistry,
    canonical_id,
    platform_from_code,
)


def test_default_number_normalizer_basic():
    n = DefaultNumberNormalizer()
    assert n.normalize("123") == Decimal("123")
    assert n.normalize(123) == Decimal("123")
    assert n.normalize("12.5") == Decimal("12.5")


def test_default_number_normalizer_chinese_units():
    n = DefaultNumberNormalizer()
    assert n.normalize("12.3万") == Decimal("123000")
    assert n.normalize("1.2亿") == Decimal("120000000")
    assert n.normalize("3万") == Decimal("30000")


def test_default_number_normalizer_latin_units():
    n = DefaultNumberNormalizer()
    assert n.normalize("1.5k") == Decimal("1500")
    assert n.normalize("1w") == Decimal("10000")


def test_default_number_normalizer_thousands_separator():
    n = DefaultNumberNormalizer()
    assert n.normalize("1,234") == Decimal("1234")


def test_default_number_normalizer_empty_markers():
    n = DefaultNumberNormalizer()
    assert n.normalize(None) is None
    assert n.normalize("") is None
    assert n.normalize("--") is None
    assert n.normalize("-") is None
    assert n.normalize("暂无") is None


def test_default_number_normalizer_invalid():
    n = DefaultNumberNormalizer()
    assert n.normalize("abc") is None
    assert n.normalize("12万3") is None


def test_default_time_normalizer_iso():
    t = DefaultTimeNormalizer()
    assert t.normalize("2026-08-24T10:00:00Z") == datetime(2026, 8, 24, 10, 0, tzinfo=timezone.utc)


def test_default_time_normalizer_unix_seconds_and_ms():
    t = DefaultTimeNormalizer()
    expected = datetime(2026, 8, 24, 10, 0, tzinfo=timezone.utc)
    unix_s = int(expected.timestamp())
    assert t.normalize(str(unix_s)) == expected
    assert t.normalize(str(unix_s * 1000)) == expected


def test_default_time_normalizer_empty_and_invalid():
    t = DefaultTimeNormalizer()
    assert t.normalize(None) is None
    assert t.normalize("") is None
    assert t.normalize("not-a-date") is None


def test_platform_from_code_mapping():
    assert platform_from_code("dy") is Platform.DOUYIN
    assert platform_from_code("xhs") is Platform.XIAOHONGSHU
    assert platform_from_code("bili") is Platform.BILIBILI
    assert platform_from_code("douyin") is Platform.DOUYIN
    assert platform_from_code("unknown") is None


def test_canonical_id_helper_matches_domain_rule():
    assert canonical_id(Platform.BILIBILI, "av1") == "bilibili:av1"


def test_registry_default_and_platform_routing():
    reg = NormalizerRegistry()
    assert reg.number_for(Platform.BILIBILI) is reg._default.number
    assert reg.time_for(Platform.BILIBILI) is reg._default.time


def test_registry_custom_platform_rules():
    class Upper(DefaultNumberNormalizer):
        def normalize(self, raw):
            return Decimal("999")

    reg = NormalizerRegistry()
    reg.register(Platform.BILIBILI, number=Upper())
    assert reg.number_for(Platform.BILIBILI).normalize("1") == Decimal("999")
    assert reg.number_for(Platform.DOUYIN).normalize("1") == Decimal("1")
