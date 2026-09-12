"""原始数据 → 统一领域模型（Normalizer 应用层）。

流程：MediaCrawler Adapter 产出 RawContent → 本模块应用 normalizer
→ Account / Content / Metric 领域对象（source=MEDIACRAWLER）。
"""

from __future__ import annotations

from datetime import datetime, timezone

from socialmedia_agent.connectors.base import RawContent
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import OwnerType
from socialmedia_agent.domain.metric import Metric
from socialmedia_agent.normalizers import NormalizerRegistry, default_registry


class RawToDomainMapper:
    def __init__(self, registry: NormalizerRegistry | None = None):
        self.registry = registry or default_registry

    def map(self, raw: RawContent) -> tuple[Account | None, Content, list[Metric]]:
        platform = raw.platform
        number = self.registry.number_for(platform)
        time_norm = self.registry.time_for(platform)

        account = Account(
            platform=platform,
            platform_id=raw.account_platform_id,
            nickname=raw.account_nickname,
            owner_type=OwnerType.OBSERVED,
        ) if raw.account_platform_id else None

        content = Content(
            platform=platform,
            platform_content_id=raw.platform_id,
            account_id=account.canonical_id if account else None,
            title=raw.title,
            content=raw.content,
            content_type=raw.content_type,
            publish_time=time_norm.normalize(raw.publish_time),
            url=raw.url,
        )

        metrics: list[Metric] = []
        captured_at = datetime.now(timezone.utc)
        for metric_type, raw_value in raw.metrics.items():
            value = number.normalize(raw_value)
            if value is None:
                continue
            metrics.append(
                Metric(
                    content_id=content.canonical_id,
                    account_id=account.canonical_id if account else None,
                    platform=platform,
                    metric_type=metric_type,
                    value=value,
                    captured_at=captured_at,
                    source=raw.source,
                    raw_value=str(raw_value) if raw_value is not None else None,
                )
            )
        return account, content, metrics
