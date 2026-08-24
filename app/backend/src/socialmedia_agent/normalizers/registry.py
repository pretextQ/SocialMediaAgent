"""Normalizer 注册中心：按平台路由数值/时间归一规则。"""

from __future__ import annotations

from dataclasses import dataclass

from socialmedia_agent.domain.enums import Platform

from .base import NumberNormalizer, TimeNormalizer
from .numbers import DefaultNumberNormalizer
from .time import DefaultTimeNormalizer


@dataclass
class PlatformRules:
    platform: Platform | None
    number: NumberNormalizer
    time: TimeNormalizer


class NormalizerRegistry:
    def __init__(self) -> None:
        self._default = PlatformRules(
            platform=None,
            number=DefaultNumberNormalizer(),
            time=DefaultTimeNormalizer(),
        )
        self._rules: dict[Platform, PlatformRules] = {}

    def register(
        self,
        platform: Platform,
        number: NumberNormalizer | None = None,
        time: TimeNormalizer | None = None,
    ) -> None:
        self._rules[platform] = PlatformRules(
            platform=platform,
            number=number or self._default.number,
            time=time or self._default.time,
        )

    def number_for(self, platform: Platform) -> NumberNormalizer:
        return self._rules.get(platform, self._default).number

    def time_for(self, platform: Platform) -> TimeNormalizer:
        return self._rules.get(platform, self._default).time

    def has_platform(self, platform: Platform) -> bool:
        return platform in self._rules


default_registry = NormalizerRegistry()
