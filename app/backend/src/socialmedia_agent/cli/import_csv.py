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
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

from socialmedia_agent.connectors.base import RawContent
from socialmedia_agent.connectors.mapper import RawToDomainMapper
from socialmedia_agent.database.migrations import upgrade_to_head
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.enums import ContentType, MetricSource, MetricType, Platform
from socialmedia_agent.domain.topic import Topic
from socialmedia_agent.logging_config import setup_logging
from socialmedia_agent.normalizers import platform_from_code
from socialmedia_agent.normalizers.time import DefaultTimeNormalizer
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.metric_repo import MetricRepository
from socialmedia_agent.repositories.topic_repo import TopicRepository

METRIC_COLUMNS: dict[str, MetricType] = {
    "views": MetricType.VIEWS,
    "likes": MetricType.LIKES,
    "comments": MetricType.COMMENTS,
    "shares": MetricType.SHARES,
    "favorites": MetricType.FAVORITES,
}

REQUIRED_COLUMNS = ("platform", "content_platform_id", "content_type")

# 话题 CSV 的列（趋势分析 / 选题推荐用）。keyword 必填，其余可空。
TOPIC_REQUIRED_COLUMNS = ("keyword",)

_TIME = DefaultTimeNormalizer()

# 依次尝试：Excel 的「CSV UTF-8」带 BOM，UTF-8，以及中文 Windows Excel 默认的 GBK
ENCODINGS = ("utf-8-sig", "utf-8", "gb18030")


class CsvImportError(ValueError):
    """CSV 内容不符合要求。"""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="import-csv", description="把手工整理的 CSV 数据导入核心库")
    parser.add_argument("--input", required=True, help="CSV 文件路径")
    parser.add_argument("--db-url", default=None, help="覆盖数据库 URL（演示/测试用）")
    parser.add_argument("--dry-run", action="store_true", help="只校验 CSV 不写库")
    parser.add_argument(
        "--topics",
        default=None,
        help="可选：话题 CSV（列 keyword,platforms,post_count,title,summary,last_seen）",
    )
    parser.add_argument(
        "--source",
        default=MetricSource.MANUAL.value,
        choices=[m.value for m in MetricSource],
        help=f"数据来源标注（默认 {MetricSource.MANUAL.value}）",
    )
    return parser


def row_to_raw(
    row: dict[str, str | None],
    line_no: int,
    source: MetricSource = MetricSource.MANUAL,
) -> RawContent:
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
        source=source,
    )


def topic_row_to_domain(
    row: dict[str, str | None],
    line_no: int,
    now: datetime | None = None,
) -> Topic:
    """话题 CSV 一行 -> Topic 领域模型。

    `last_seen` 留空时取当前时间——种子/演示数据里话题本来就该是「近期」的，
    否则趋势查询的时间窗口会把它过滤掉（这正是 demo 库趋势为空的成因）。
    """
    for column in TOPIC_REQUIRED_COLUMNS:
        if not (row.get(column) or "").strip():
            raise CsvImportError(f"第 {line_no} 行话题缺少必填列 {column!r}")

    keyword = row["keyword"].strip()

    platforms: list[Platform] = []
    platforms_raw = (row.get("platforms") or "").strip()
    if platforms_raw:
        for token in re.split(r"[|,;/]", platforms_raw):
            code = token.strip()
            if not code:
                continue
            platform = platform_from_code(code)
            if platform is None:
                raise CsvImportError(f"第 {line_no} 行话题平台代号无法识别: {code!r}")
            if platform not in platforms:
                platforms.append(platform)

    post_raw = (row.get("post_count") or "").strip()
    post_count = 0
    if post_raw:
        try:
            post_count = int(float(post_raw))
        except ValueError as exc:
            raise CsvImportError(f"第 {line_no} 行话题 post_count 非法: {post_raw!r}") from exc

    last_seen_raw = (row.get("last_seen") or "").strip()
    if last_seen_raw:
        last_seen = _TIME.normalize(last_seen_raw)
        if last_seen is None:
            raise CsvImportError(f"第 {line_no} 行话题 last_seen 无法解析: {last_seen_raw!r}")
    else:
        last_seen = now or datetime.now(timezone.utc)

    def clean(key: str) -> str | None:
        value = (row.get(key) or "").strip()
        return value or None

    return Topic(
        keyword=keyword,
        title=clean("title"),
        platforms=platforms,
        last_seen=last_seen,
        post_count=post_count,
        summary=clean("summary"),
    )


def read_topics(path: Path) -> list[Topic]:
    """读取话题 CSV 并整体校验。"""
    return [
        topic_row_to_domain(row, line_no)
        for line_no, row in enumerate(read_rows(path), start=2)
    ]


def read_rows(path: Path) -> list[dict[str, str | None]]:
    """读取 CSV，自动兼容 Excel 常见的几种编码。

    Excel 在中文 Windows 上「另存为 CSV」默认写 GBK，因此不能只按 UTF-8 读。
    """
    last_error: Exception | None = None
    for encoding in ENCODINGS:
        try:
            with path.open(encoding=encoding, newline="") as handle:
                return list(csv.DictReader(handle))
        except UnicodeDecodeError as exc:
            last_error = exc
            continue
        except OSError as exc:
            raise CsvImportError(f"读取失败: {exc}") from exc
    raise CsvImportError(
        "无法识别文件编码（已尝试 UTF-8 / GBK）。请在 Excel 中「另存为 -> CSV UTF-8」后重试。"
    ) from last_error


def main(argv: list[str] | None = None) -> int:
    setup_logging()
    args = build_parser().parse_args(argv)

    path = Path(args.input)
    if not path.exists():
        print(f"[import-csv] 文件不存在: {path}", file=sys.stderr)
        return 1

    try:
        rows = read_rows(path)
    except CsvImportError as exc:
        print(f"[import-csv] {exc}", file=sys.stderr)
        return 1

    if not rows:
        print(f"[import-csv] CSV 无数据行: {path}", file=sys.stderr)
        return 1

    # 先整体校验：任一行有问题就整体失败，避免写一半留下脏数据
    source = MetricSource(args.source)
    try:
        raws = [row_to_raw(row, line_no, source) for line_no, row in enumerate(rows, start=2)]
    except CsvImportError as exc:
        print(f"[import-csv] 数据错误: {exc}", file=sys.stderr)
        return 1

    topics: list[Topic] = []
    if args.topics:
        topics_path = Path(args.topics)
        if not topics_path.exists():
            print(f"[import-csv] 话题文件不存在: {topics_path}", file=sys.stderr)
            return 1
        try:
            topics = read_topics(topics_path)
        except CsvImportError as exc:
            print(f"[import-csv] 话题数据错误: {exc}", file=sys.stderr)
            return 1

    if args.dry_run:
        print(
            f"[import-csv] 校验通过（dry-run，未写库）："
            f"{len(raws)} 行内容 / {len(topics)} 条话题"
        )
        return 0

    database = Database(url=args.db_url)
    upgrade_to_head(database.url)
    mapper = RawToDomainMapper()

    accounts = contents = metrics = 0
    with database.session() as session:
        account_repo = AccountRepository(session)
        content_repo = ContentRepository(session)
        metric_repo = MetricRepository(session)
        topic_repo = TopicRepository(session)
        for raw in raws:
            account, content, metric_items = mapper.map(raw)
            if account is not None:
                account_repo.upsert(account)
                accounts += 1
            content_repo.upsert(content)
            contents += 1
            for metric in metric_items:
                metric_repo.upsert(metric)
                metrics += 1
        for topic in topics:
            topic_repo.upsert(topic)

    # 汇报库内实际数量（去重后），避免把"处理次数"误读成"新增条数"
    with database.session() as session:
        stored_accounts = len(AccountRepository(session).list(limit=10**9))
        stored_contents = len(ContentRepository(session).list(limit=10**9))
        stored_metrics = len(MetricRepository(session).list(limit=10**9))
        stored_topics = len(TopicRepository(session).list(limit=10**9))

    print(
        f"[import-csv] 完成 处理行数={len(raws)} | "
        f"库内 accounts={stored_accounts} contents={stored_contents} "
        f"metrics={stored_metrics} topics={stored_topics} | "
        f"source={source.value} -> {database.url}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
