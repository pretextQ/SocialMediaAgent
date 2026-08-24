"""CLI：ingest 命令 —— 采集指定平台关键词并幂等入库。

用法：
    python -m socialmedia_agent.cli.ingest --keyword "人工智能" --platform bili --limit 5
"""

from __future__ import annotations

import argparse
import sys

from socialmedia_agent.connectors.mediacrawler import MediaCrawlerConnector
from socialmedia_agent.connectors.mediacrawler.runner import MediaCrawlerRunError
from socialmedia_agent.database.session import Database
from socialmedia_agent.logging_config import setup_logging
from socialmedia_agent.services.ingest import IngestService


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="ingest", description="采集指定平台关键词数据并入库")
    parser.add_argument("--keyword", required=True, help="搜索关键词")
    parser.add_argument("--platform", default="bili", help="平台代号（默认 bili）")
    parser.add_argument("--limit", type=int, default=5, help="每平台最多内容数")
    parser.add_argument("--db-url", default=None, help="覆盖数据库 URL（演示/测试用）")
    return parser


def main(argv: list[str] | None = None) -> int:
    setup_logging()
    args = build_parser().parse_args(argv)

    database = Database(url=args.db_url)
    database.create_all()
    connector = MediaCrawlerConnector()
    service = IngestService(connector=connector, database=database)

    try:
        result = service.ingest_search(args.keyword, platform=args.platform, limit=args.limit)
    except MediaCrawlerRunError as exc:
        print(f"[ingest] 采集失败：{exc}", file=sys.stderr)
        return 1

    print(
        f"[ingest] 完成 keyword={result.keyword} platform={result.platform} "
        f"accounts={result.account_count} contents={result.content_count} "
        f"metrics={result.metric_count}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
