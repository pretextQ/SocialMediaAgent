"""Alembic 迁移体系测试（TDD）。

守护三条不变量：

1. **模型与迁移同步**：`upgrade head` 建出的表集合必须与 `Base.metadata.create_all` 完全一致
   —— 改了 ORM 却忘了写迁移，这里会红。
2. **幂等**：重复 `upgrade head` 不报错。
3. **能收养既有库**：由 `create_all` 建过、没有 `alembic_version` 的库（真实项目里大量存在）
   必须先 stamp 再迁移，否则会 "table already exists"。
"""

import pytest
from sqlalchemy import inspect, text

from socialmedia_agent.database.engine import create_db_engine
from socialmedia_agent.database.migrations import upgrade_to_head
from socialmedia_agent.models import Base


def _tables(url: str) -> set[str]:
    engine = create_db_engine(url)
    try:
        return set(inspect(engine).get_table_names())
    finally:
        engine.dispose()


def _create_all_tables() -> set[str]:
    engine = create_db_engine("sqlite:///:memory:")
    try:
        Base.metadata.create_all(engine)
        return set(inspect(engine).get_table_names())
    finally:
        engine.dispose()


def test_migration_schema_matches_models(tmp_path):
    url = f"sqlite:///{tmp_path / 'mig.db'}"

    upgrade_to_head(url)

    migrated = _tables(url) - {"alembic_version"}
    assert migrated == _create_all_tables()


def test_upgrade_is_idempotent(tmp_path):
    url = f"sqlite:///{tmp_path / 'mig2.db'}"

    upgrade_to_head(url)
    upgrade_to_head(url)

    assert "accounts" in _tables(url)


def test_adopts_database_created_by_create_all(tmp_path):
    """既有库（create_all 建的、无 alembic_version）必须能被收养，而不是报错。"""
    url = f"sqlite:///{tmp_path / 'legacy.db'}"
    engine = create_db_engine(url)
    Base.metadata.create_all(engine)
    engine.dispose()
    assert "alembic_version" not in _tables(url)

    upgrade_to_head(url)

    assert "alembic_version" in _tables(url)
    assert "accounts" in _tables(url)


def test_drops_legacy_comments_table(tmp_path):
    """Comment 模型已删除；老库里遗留的 comments 表应由迁移清掉（增量变更的实战用例）。"""
    url = f"sqlite:///{tmp_path / 'legacy_comments.db'}"
    engine = create_db_engine(url)
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE comments (id TEXT PRIMARY KEY)"))
    engine.dispose()
    assert "comments" in _tables(url)

    upgrade_to_head(url)

    assert "comments" not in _tables(url)


def test_in_memory_url_is_rejected():
    """内存库无法迁移（迁移会跑到另一个连接上）——明确报错，别静默变成空库。"""
    with pytest.raises(ValueError, match="内存库"):
        upgrade_to_head("sqlite:///:memory:")
