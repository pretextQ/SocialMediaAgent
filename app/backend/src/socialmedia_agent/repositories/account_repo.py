"""Account Repository：以 canonical_id 幂等 upsert。"""

from __future__ import annotations

from sqlalchemy import select

from socialmedia_agent.domain.account import Account as AccountDomain
from socialmedia_agent.models import AccountModel

from .base import BaseRepository


class AccountRepository(BaseRepository):
    model = AccountModel

    def upsert(self, account: AccountDomain) -> AccountModel:
        existing = self.session.scalar(
            select(AccountModel).where(AccountModel.canonical_id == account.canonical_id)
        )
        if existing is not None:
            self._apply(existing, account)
            self.session.commit()
            return existing
        model = AccountModel.from_domain(account)
        self.session.add(model)
        self.session.commit()
        return model

    @staticmethod
    def _apply(model: AccountModel, account: AccountDomain) -> None:
        model.nickname = account.nickname
        model.avatar_url = account.avatar_url
        model.owner_type = account.owner_type.value
        model.extra = account.extra
