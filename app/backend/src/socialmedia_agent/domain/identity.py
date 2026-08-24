"""canonical_id 派生规则（架构定稿：f"{platform}:{platform_id}"）。

Account 与 Content 共用同一规则，保证跨表可关联、可幂等去重。
"""

from .enums import Platform


def make_canonical_id(platform: Platform, platform_id: str) -> str:
    if not platform_id:
        raise ValueError("platform_id 不能为空")
    return f"{platform.value}:{platform_id}"
