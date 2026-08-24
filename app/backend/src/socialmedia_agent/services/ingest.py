"""IngestService：Connector → Normalizer(Mapper) → 统一模型 → 幂等入库。"""

from __future__ import annotations

from dataclasses import dataclass, field

from socialmedia_agent.connectors.base import PlatformConnector
from socialmedia_agent.connectors.mapper import RawToDomainMapper
from socialmedia_agent.database.session import Database
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.metric_repo import MetricRepository


@dataclass
class IngestResult:
    keyword: str
    platform: str
    account_count: int = 0
    content_count: int = 0
    metric_count: int = 0


class IngestService:
    def __init__(
        self,
        connector: PlatformConnector,
        database: Database,
        mapper: RawToDomainMapper | None = None,
    ):
        self.connector = connector
        self.database = database
        self.mapper = mapper or RawToDomainMapper()

    def ingest_search(self, keyword: str, platform: str = "bili", limit: int = 10) -> IngestResult:
        raws = self.connector.search(keyword, platform=platform, limit=limit)
        result = IngestResult(keyword=keyword, platform=platform)

        with self.database.session() as session:
            accounts = AccountRepository(session)
            contents = ContentRepository(session)
            metrics = MetricRepository(session)

            for raw in raws:
                account, content, metric_items = self.mapper.map(raw)
                if account is not None:
                    accounts.upsert(account)
                    result.account_count += 1
                contents.upsert(content)
                result.content_count += 1
                for metric in metric_items:
                    metrics.upsert(metric)
                    result.metric_count += 1
        return result
