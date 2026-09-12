"""数据库迁移入口（Alembic）。

暴露成函数，供应用启动与 CLI 调用：

- **真实库 / 生产入口**走 Alembic（可增量变更，不丢数据）；
- **测试与临时库**仍可用 Database.create_all()（快），两者一致性由
  tests/unit/test_migrations.py 守护。

**既有库收养**：早期用 create_all 建的库没有 alembic_version 表，
直接 upgrade 会因「表已存在」失败。本模块会先判断并 stamp **基线版本**
（不是 head——否则未执行的迁移会被误标为已完成），再 upgrade 到 head。

Memory 库不在本体系内——它使用独立的 MemoryBase（见 memory/store.py）。
"""

from __future__ import annotations

import logging
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect

from socialmedia_agent.config import BACKEND_DIR, get_settings
from socialmedia_agent.database.engine import create_db_engine

logger = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(BACKEND_DIR) / "migrations"
ALEMBIC_VERSION_TABLE = "alembic_version"


def _build_config(url: str) -> Config:
    """显式注入 script_location 与 URL，不依赖 alembic.ini / 当前工作目录。"""
    cfg = Config()
    cfg.set_main_option("script_location", str(MIGRATIONS_DIR))
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


def _base_revision(cfg: Config) -> str:
    """迁移链的根版本（即「既有 create_all 库」所处的版本）。

    收养时必须 stamp **基线**而不是 head：stamp head 会把尚未执行的迁移
    直接标记为已完成，它们就永远不会在既有库上跑（例如删 comments 表那条）。
    """
    base = ScriptDirectory.from_config(cfg).get_base()
    if base is None:
        raise RuntimeError("迁移目录里没有基线版本，无法收养既有库")
    return base


def _needs_adoption(url: str) -> bool:
    """有表但没有 alembic_version —— 说明这是 create_all 建出来的库。"""
    engine = create_db_engine(url)
    try:
        tables = set(inspect(engine).get_table_names())
    finally:
        engine.dispose()
    return bool(tables) and ALEMBIC_VERSION_TABLE not in tables


def upgrade_to_head(url: str | None = None, *, adopt_existing: bool = True) -> None:
    """把指定库升到最新版本（建表 / 增量变更）。"""
    target = url or get_settings().database_url
    if ":memory:" in target:
        raise ValueError(
            "内存库无法用 Alembic 迁移（迁移会在另一个连接上执行）；请改用 Database.create_all()"
        )

    cfg = _build_config(target)
    if adopt_existing and _needs_adoption(target):
        base = _base_revision(cfg)
        logger.warning(
            "检测到由 create_all 建立的库（无 %s），先 stamp 到基线 %s 再迁移: %s",
            ALEMBIC_VERSION_TABLE,
            base,
            target,
        )
        command.stamp(cfg, base)

    logger.info("alembic upgrade head -> %s", target)
    command.upgrade(cfg, "head")
