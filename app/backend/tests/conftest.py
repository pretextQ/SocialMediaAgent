"""测试公共 fixtures。"""

import pytest
from sqlalchemy.orm import sessionmaker

from socialmedia_agent.database.engine import create_db_engine
from socialmedia_agent.models import Base  # noqa: F401  触发模型注册


@pytest.fixture
def db_session(tmp_path):
    """独立 SQLite 测试库，每个用例隔离。"""
    engine = create_db_engine(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        yield session
    engine.dispose()
