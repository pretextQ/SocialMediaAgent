"""PlatformConnector 抽象接口：第三方数据源接入的唯一边界。

所有数据源（MediaCrawler / 未来官方 API / 自有账号）都实现本接口；
核心业务（Agent/Tool/Service）只依赖它，不直接接触第三方内部实现。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from socialmedia_agent.domain.enums import ContentType, MetricSource, MetricType, Platform


@dataclass
class RawContent:
    """采集侧原始内容（尚未归一）。"""

    platform: Platform
    platform_id: str
    account_platform_id: str | None = None
    account_nickname: str | None = None
    title: str | None = None
    content: str | None = None
    content_type: ContentType = ContentType.VIDEO
    publish_time: object | None = None
    url: str | None = None
    metrics: dict[MetricType, object] = field(default_factory=dict)
    # 数据来源（审计用）：采集默认 mediacrawler，手工导入等场景可覆盖
    source: MetricSource = MetricSource.MEDIACRAWLER


class PlatformConnector(ABC):
    @abstractmethod
    def search(self, keyword: str, platform: str, limit: int = 10) -> list[RawContent]:
        """按关键词采集公共内容，返回原始数据。platform 为平台代号（如 'bili'）。"""
