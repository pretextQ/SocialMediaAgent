"""Comment 领域模型（纯 Pydantic，不绑 ORM）。

字段对齐架构定稿：
id, platform, platform_comment_id, content_id(FK), parent_comment_id,
author_nickname, content, like_count, publish_time。

content_id 关联 Content.canonical_id，保证评论可回溯到内容（P1 关联）。
"""

from datetime import datetime

from pydantic import BaseModel

from .enums import Platform


class Comment(BaseModel):
    id: str | None = None
    platform: Platform
    platform_comment_id: str
    content_id: str
    parent_comment_id: str | None = None
    author_nickname: str | None = None
    content: str | None = None
    like_count: int | None = None
    publish_time: datetime | None = None
