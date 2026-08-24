"""通用 Repository 基类：对业务层屏蔽 SQL。"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from socialmedia_agent.database.base import Base


class BaseRepository:
    model: type[Base]

    def __init__(self, session: Session):
        self.session = session

    def get(self, obj_id: str) -> Base | None:
        return self.session.get(self.model, obj_id)

    def list(self, *, limit: int = 100, offset: int = 0, **filters: Any) -> list[Base]:
        stmt = select(self.model).order_by(self.model.id).limit(limit).offset(offset)
        for key, value in filters.items():
            if value is not None:
                stmt = stmt.where(getattr(self.model, key) == value)
        return list(self.session.scalars(stmt))

    def insert(self, model_obj: Base) -> Base:
        self.session.add(model_obj)
        self.session.commit()
        self.session.refresh(model_obj)
        return model_obj

    def delete(self, model_obj: Base) -> None:
        self.session.delete(model_obj)
        self.session.commit()
