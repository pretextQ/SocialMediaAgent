"""MediaCrawler 中转库显式 schema 映射。

架构约束：读取中转 SQLite 必须使用显式字段映射，禁止动态列名探测。
每个平台一张表、显式列名；P1 先落地 bilibili，其余平台按需追加。
"""

from __future__ import annotations

from dataclasses import dataclass

from socialmedia_agent.domain.enums import ContentType, MetricType, Platform

# 平台代号（MediaCrawler 命令行）→ 本模块 schema 键
_PLATFORM_CODE_KEY = {
    "bili": "bilibili",
    "xhs": "xiaohongshu",
    "dy": "douyin",
    "ks": "kuaishou",
    "wb": "weibo",
    "zhihu": "zhihu",
    "tieba": "tieba",
}


@dataclass(frozen=True)
class PlatformTableSchema:
    key: str
    table: str
    platform: Platform
    content_type: ContentType
    columns: dict[str, str]  # 语义列名 → 中转表列名
    metric_columns: dict[MetricType, str]  # 指标类型 → 中转表列名
    time_mode: str = "unix"


SCHEMAS: dict[str, PlatformTableSchema] = {
    "bilibili": PlatformTableSchema(
        key="bilibili",
        table="bilibili_video",
        platform=Platform.BILIBILI,
        content_type=ContentType.VIDEO,
        columns={
            "id": "video_id",
            "account_id": "user_id",
            "nickname": "nickname",
            "title": "title",
            "content": "desc",
            "publish_time": "create_time",
            "url": "video_url",
        },
        metric_columns={
            MetricType.VIEWS: "video_play_count",
            MetricType.LIKES: "liked_count",
            MetricType.COMMENTS: "video_comment",
            MetricType.SHARES: "video_share_count",
            MetricType.FAVORITES: "video_favorite_count",
        },
        time_mode="unix",
    ),
}


def get_table_schema(platform_code: str) -> PlatformTableSchema:
    """按平台代号（如 'bili'）取显式 schema；未知平台报错（不猜测列）。"""
    key = _PLATFORM_CODE_KEY.get(platform_code.strip().lower())
    if key is None:
        raise KeyError(f"不支持的平台代号: {platform_code!r}")
    try:
        return SCHEMAS[key]
    except KeyError as exc:  # pragma: no cover - 由 get_table_schema 保护
        raise KeyError(f"平台 {platform_code!r} 尚未提供显式 schema") from exc
