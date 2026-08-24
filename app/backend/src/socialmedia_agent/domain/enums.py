"""领域枚举：平台与账号归属语义。

平台值使用完整英文名（与 MediaCrawler 平台代号 dy/xhs/bili 等的映射
在 normalizers 层完成，见 P0.6）。
"""

from enum import Enum


class Platform(str, Enum):
    DOUYIN = "douyin"
    XIAOHONGSHU = "xiaohongshu"
    BILIBILI = "bilibili"
    KUAISHOU = "kuaishou"
    CHANNELS = "channels"
    WEIBO = "weibo"
    ZHIHU = "zhihu"
    TIEBA = "tieba"


class OwnerType(str, Enum):
    """账号归属语义：自有账号 vs 观察账号。"""

    OWNER = "owner"
    OBSERVED = "observed"


class ContentType(str, Enum):
    VIDEO = "video"
    IMAGE = "image"
    ARTICLE = "article"
    NOTE = "note"


class MetricType(str, Enum):
    VIEWS = "views"
    LIKES = "likes"
    COMMENTS = "comments"
    SHARES = "shares"
    FAVORITES = "favorites"


class MetricSource(str, Enum):
    """指标数据来源（用于审计与可追溯）。"""

    MEDIACRAWLER = "mediacrawler"
    MATRIXFLOW = "matrixflow"
    OFFICIAL_API = "official_api"
    MANUAL = "manual"
