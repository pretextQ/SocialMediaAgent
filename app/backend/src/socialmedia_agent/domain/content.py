"""Content 领域模型（纯 Pydantic，不绑 ORM）。

字段对齐架构定稿：
id, canonical_id, platform, platform_content_id, account_id(FK),
title, content, content_type, publish_time, url, raw_metadata(JSON)。

canonical_id 始终由 platform + platform_content_id 派生。
account_id 关联 Account.canonical_id（跨表关联依赖 canonical_id，见 P1 DoD）。
"""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator

from .enums import ContentType, Platform
from .identity import make_canonical_id


class Content(BaseModel):
    id: str | None = None
    canonical_id: str = ""
    platform: Platform
    platform_content_id: str
    account_id: str | None = None
    title: str | None = None
    content: str | None = None
    content_type: ContentType
    publish_time: datetime | None = None
    url: str | None = None
    raw_metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _derive_canonical_id(self) -> "Content":
        self.canonical_id = make_canonical_id(self.platform, self.platform_content_id)
        return self
