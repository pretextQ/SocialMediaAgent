"""ORM 模型：Account 映射 domain/account.py。"""

from __future__ import annotations

import uuid

from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from socialmedia_agent.database.base import Base
from socialmedia_agent.domain.account import Account as AccountDomain
from socialmedia_agent.domain.enums import OwnerType, Platform


class AccountModel(Base):
    __tablename__ = "accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: uuid.uuid4().hex)
    canonical_id: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    platform: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    platform_id: Mapped[str] = mapped_column(String(255), nullable=False)
    nickname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    owner_type: Mapped[str] = mapped_column(String(16), nullable=False, default=OwnerType.OBSERVED.value)
    extra: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    @classmethod
    def from_domain(cls, account: AccountDomain) -> "AccountModel":
        return cls(
            id=account.id,
            canonical_id=account.canonical_id,
            platform=account.platform.value,
            platform_id=account.platform_id,
            nickname=account.nickname,
            avatar_url=account.avatar_url,
            owner_type=account.owner_type.value,
            extra=account.extra,
        )

    def to_domain(self) -> AccountDomain:
        return AccountDomain(
            id=self.id,
            platform=Platform(self.platform),
            platform_id=self.platform_id,
            nickname=self.nickname,
            avatar_url=self.avatar_url,
            owner_type=OwnerType(self.owner_type),
            extra=self.extra or {},
        )
