"""Account 领域模型（纯 Pydantic，不绑 ORM）。

字段对齐架构定稿：
id, canonical_id(唯一), platform, platform_id, nickname, avatar_url,
owner_type(owner|observed), extra(JSON)。

canonical_id 始终由 platform + platform_id 派生，不允许手工指定不一致值。
"""

from typing import Any

from pydantic import BaseModel, Field, model_validator

from .enums import OwnerType, Platform
from .identity import make_canonical_id


class Account(BaseModel):
    id: str | None = None
    canonical_id: str = ""
    platform: Platform
    platform_id: str
    nickname: str | None = None
    avatar_url: str | None = None
    owner_type: OwnerType = OwnerType.OBSERVED
    extra: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _derive_canonical_id(self) -> "Account":
        self.canonical_id = make_canonical_id(self.platform, self.platform_id)
        return self
