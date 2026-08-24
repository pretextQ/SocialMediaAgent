"""平台归一规则装配。

当前所有平台使用默认规则；后续某平台口径特殊时，在此集中注册，
不散落在采集代码中。
"""

from __future__ import annotations

from socialmedia_agent.domain.enums import Platform

from .registry import NormalizerRegistry


def install_default_rules(registry: NormalizerRegistry) -> None:
    for platform in Platform:
        registry.register(platform)
