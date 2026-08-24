"""API 依赖注入。"""

from collections.abc import Iterator

from fastapi import Request
from sqlalchemy.orm import Session

from socialmedia_agent.database.session import Database


def get_session(request: Request) -> Iterator[Session]:
    database: Database = request.app.state.database
    with database.session() as session:
        yield session
