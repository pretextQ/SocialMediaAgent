"""ID 归一：平台代号 → Platform 枚举，以及 canonical_id 便捷派生。"""

from __future__ import annotations

from socialmedia_agent.domain.enums import Platform
from socialmedia_agent.domain.identity import make_canonical_id

# MediaCrawler 平台代号与完整英文名 → Platform 枚举
PLATFORM_CODE_MAP: dict[str, Platform] = {
    "douyin": Platform.DOUYIN,
    "dy": Platform.DOUYIN,
    "xiaohongshu": Platform.XIAOHONGSHU,
    "xhs": Platform.XIAOHONGSHU,
    "bilibili": Platform.BILIBILI,
    "bili": Platform.BILIBILI,
    "kuaishou": Platform.KUAISHOU,
    "ks": Platform.KUAISHOU,
    "channels": Platform.CHANNELS,
    "weibo": Platform.WEIBO,
    "wb": Platform.WEIBO,
    "zhihu": Platform.ZHIHU,
    "tieba": Platform.TIEBA,
}


def platform_from_code(code: str) -> Platform | None:
    """平台代号（如 'dy'/'xhs'）→ Platform 枚举；未知返回 None。"""
    return PLATFORM_CODE_MAP.get(str(code).strip().lower())


def canonical_id(platform: Platform, platform_id: str) -> str:
    """canonical_id 派生（复用 domain/identity，保持单一来源）。"""
    return make_canonical_id(platform, platform_id)
