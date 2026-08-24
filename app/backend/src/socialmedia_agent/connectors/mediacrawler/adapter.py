"""MediaCrawlerConnector：经 runner + reader 接入 MediaCrawler 数据源。"""

from __future__ import annotations

from socialmedia_agent.connectors.base import PlatformConnector, RawContent
from socialmedia_agent.domain.enums import MetricType

from .reader import MediaCrawlerReader
from .runner import MediaCrawlerRunner
from .schemas import PlatformTableSchema, get_table_schema


class MediaCrawlerConnector(PlatformConnector):
    def __init__(
        self,
        runner: MediaCrawlerRunner | None = None,
        reader: MediaCrawlerReader | None = None,
    ):
        self.runner = runner or MediaCrawlerRunner()
        self.reader = reader or MediaCrawlerReader()

    def search(self, keyword: str, platform: str = "bili", limit: int = 10) -> list[RawContent]:
        self.runner.run_search(platform, keyword, max_count=limit)
        rows = self.reader.read_latest_contents(platform, keyword, max_count=limit)
        schema = get_table_schema(platform)
        return [self._to_raw(row, schema) for row in rows]

    @staticmethod
    def _to_raw(row: dict, schema: PlatformTableSchema) -> RawContent:
        return RawContent(
            platform=schema.platform,
            platform_id=str(row.get("id") or ""),
            account_platform_id=str(row.get("account_id")) if row.get("account_id") is not None else None,
            account_nickname=row.get("nickname"),
            title=row.get("title"),
            content=row.get("content"),
            content_type=schema.content_type,
            publish_time=row.get("publish_time"),
            url=row.get("url"),
            metrics={mtype: raw for mtype, raw in (row.get("metrics") or {}).items()},
        )
