"""读取 MediaCrawler 中转 SQLite（显式 schema，不做列名探测）。"""

from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

from socialmedia_agent.domain.enums import MetricType

from .schemas import PlatformTableSchema, get_table_schema

logger = logging.getLogger(__name__)


class MediaCrawlerReader:
    def __init__(self, db_path: str | Path):
        self.db_path = Path(db_path)

    def _connect(self) -> sqlite3.Connection:
        if not self.db_path.exists():
            raise FileNotFoundError(f"MediaCrawler 中转库不存在: {self.db_path}")
        return sqlite3.connect(str(self.db_path))

    def read_latest_contents(
        self,
        platform_code: str,
        keyword: str,
        max_count: int = 10,
    ) -> list[dict]:
        """按显式列读取最新内容；仅保留命中关键词的原始行。"""
        schema = get_table_schema(platform_code)
        select_cols = [*schema.columns.values(), *schema.metric_columns.values()]
        columns_sql = ", ".join(select_cols)

        with self._connect() as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                f"SELECT {columns_sql} FROM {schema.table} ORDER BY ROWID DESC LIMIT ?",
                (max_count,),
            ).fetchall()

        result = [self._to_row(schema, dict(row), keyword) for row in rows if self._match(schema, dict(row), keyword)]
        logger.debug("读取中转库 table=%s rows=%s", schema.table, len(result))
        return result

    @staticmethod
    def _match(schema: PlatformTableSchema, row: dict, keyword: str) -> bool:
        kw = keyword.lower()
        title = str(row.get(schema.columns.get("title")) or "").lower()
        content = str(row.get(schema.columns.get("content")) or "").lower()
        return kw in title or kw in content

    @staticmethod
    def _to_row(schema: PlatformTableSchema, row: dict, keyword: str) -> dict:
        result = {
            "keyword": keyword,
            "platform": schema.platform,
            "content_type": schema.content_type,
            "metrics": {},
        }
        for semantic, column in schema.columns.items():
            result[semantic] = row.get(column)
        for metric_type, column in schema.metric_columns.items():
            result["metrics"][metric_type] = row.get(column)
        return result
