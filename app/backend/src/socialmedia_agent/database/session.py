"""会话管理：Database 封装 engine + session factory + 建表。"""

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from .engine import create_db_engine, get_database_url


class Database:
    def __init__(self, url: str | None = None):
        self.url = url or get_database_url()
        self._ensure_sqlite_dir()
        self.engine: Engine = create_db_engine(self.url)
        self._factory = sessionmaker(bind=self.engine, expire_on_commit=False)

    def _ensure_sqlite_dir(self) -> None:
        if not self.url.startswith("sqlite:///"):
            return
        path = self.url[len("sqlite:///"):]
        if path == ":memory:":
            return
        parent = path.rsplit("/", 1)[0] if "/" in path else path.rsplit("\\", 1)[0]
        if parent:
            Path(parent).mkdir(parents=True, exist_ok=True)

    def create_all(self) -> None:
        from socialmedia_agent.models import Base  # noqa: F401  触发模型注册

        Base.metadata.create_all(self.engine)

    @contextmanager
    def session(self) -> Iterator[Session]:
        with self._factory() as session:
            yield session
