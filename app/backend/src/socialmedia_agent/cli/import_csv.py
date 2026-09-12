"""CLI：import-csv —— 把手工整理的 CSV 数据幂等导入核心库。

用途：在不使用采集器的情况下，把**真实数据**（手工从平台公开页面或创作者后台整理）
导入统一领域模型，供 Agent 与评测使用。解决「没有真实数据」的阻塞。

用法：
    python -m socialmedia_agent.cli.import_csv --input seed/data_template.csv

数据流（与采集链路完全一致，不绕过 Normalizer）：
    CSV 行 -> RawContent -> RawToDomainMapper -> Repository.upsert（幂等）

来源标注：所有由本命令写入的指标 source=manual，与采集数据可区分、可审计。
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

from socialmedia_agent.connectors.base import RawContent
from socialmedia_agent.connectors.mapper import RawToDomainMapper
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.enums import ContentType, MetricSource, MetricType
from socialmedia_agent.logging_config import setup_logging
from socialmedia_agent.normalizers import platform_from_code
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.metric_repo import MetricRepository

METRIC_COLUMNS: dict[str, MetricType] = {
    "views": MetricType.VIEWS,
    "likes": MetricType.LIKES,
    "comments": MetricType.COMMENTS,
    "shares": MetricType.SHARES,
    "favorites": MetricType.FAVORITES,
}

REQUIRED_COLUMNS = ("platform", "content_platform_id", "content_type")


class CsvImportError(ValueError):
    """CSV 内容不符合要求。"""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="import-csv", description="把手工整理的 CSV 数据导入核心库")
    parser.add_argument("--input", required=True, help="CSV 文件路径")
    parser.add_argument("--db-url", default=None, help="覆盖数据库 URL（演示/测试用）")
    return parser


def row_to_raw(row: dict[str, str | None], line_no: int) -> RawContent:
    """把一行 CSV 转成 RawContent（仍由 Normalizer 完成口径归一）。"""
    for column in REQUIRED_COLUMNS:
        if not (row.get(column) or "").strip():
            raise CsvImportError(f"第 {line_no} 行缺少必填列 {column!r}")

    platform = platform_from_code(row["platform"])
    if platform is None:
        raise CsvImportError(f"第 {line_no} 行平台代号无法识别: {row['platform']!r}")

    raw_content_type = row["content_type"].strip()
    try:
        content_type = ContentType(raw_content_type)
    except ValueError as exc:
        raise CsvImportError(f"第 {line_no} 行 content_type 非法: {raw_content_type!r}") from exc

    metrics: dict[MetricType, object] = {}
    for column, metric_type in METRIC_COLUMNS.items():
        value = (row.get(column) or "").strip()
        if value:
            metrics[metric_type] = value

    def clean(key: str) -> str | None:
        value = (row.get(key) or "").strip()
        return value or None

    return RawContent(
        platform=platform,
        platform_id=row["content_platform_id"].strip(),
        account_platform_id=clean("account_platform_id"),
        account_nickname=clean("account_nickname"),
        title=clean("title"),
        content=clean("content"),
        content_type=content_type,
        publish_time=clean("publish_time"),
        url=clean("url"),
        metrics=metrics,
        source=MetricSource.MANUAL,
    )


def main(argv: list[str] | None = None) -> int:
    setup_logging()
    args = build_parser().parse_args(argv)

    path = Path(args.input)
    if not path.exists():
        print(f"[import-csv] 文件不存在: {path}", file=sys.stderr)
        return 1

    try:
        with path.open(encoding="utf-8-sig", newline="") as handle:
            rows = list(csv.DictReader(handle))
    except OSError as exc:
        print(f"[import-csv] 读取失败: {exc}", file=sys.stderr)
        return 1

    if not rows:
        print(f"[import-csv] CSV 无数据行: {path}", file=sys.stderr)
        return 1

    database = Database(url=args.db_url)
    database.create_all()
    mapper = RawToDomainMapper()

    accounts = contents = metrics = 0
    try:
        with database.session() as session:
            account_repo = AccountRepository(session)
            content_repo = ContentRepository(session)
            metric_repo = MetricRepository(session)
            for line_no, row in enumerate(rows, start=2):  # 第 1 行是表头
                raw = row_to_raw(row, line_no)
                account, content, metric_items = mapper.map(raw)
                if account is not None:
                    account_repo.upsert(account)
                    accounts += 1
                content_repo.upsert(content)
                contents += 1
                for metric in metric_items:
                    metric_repo.upsert(metric)
                    metrics += 1
    except CsvImportError as exc:
        print(f"[import-csv] 数据错误: {exc}", file=sys.stderr)
        return 1

    print(
        f"[import-csv] 完成 accounts={accounts} contents={contents} metrics={metrics} "
        f"-> {database.url}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
