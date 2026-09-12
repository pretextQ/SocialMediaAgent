"""Alembic 运行环境。

约定：

- **URL 来源**：调用方通过 `Config.set_main_option("sqlalchemy.url", ...)` 注入
  （见 `socialmedia_agent/database/migrations.py`）；未注入时回退到 `Settings.database_url`。
  因此 `alembic.ini` 里的 `sqlalchemy.url` 故意留空。
- **目标元数据**：`socialmedia_agent.models.Base.metadata`（import 后核心表全部注册）。
- **Memory 不在本迁移体系内**：它使用独立的 `MemoryBase`，由 `SQLAlchemyMemoryStore.create_all`
  自建，与核心库物理分离（见 docs/architecture.md）。
- **render_as_batch**：SQLite 不支持大部分 `ALTER TABLE`，batch 模式才能做列变更。
"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from socialmedia_agent.config import get_settings
from socialmedia_agent.models import Base  # noqa: F401 - import 即注册全部核心表

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _database_url() -> str:
    """优先用调用方注入的 URL，否则回退到 Settings（默认库 / SMA_DB_URL）。"""
    injected = config.get_main_option("sqlalchemy.url")
    return injected or get_settings().database_url


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = _database_url()
    connectable = engine_from_config(
        section, prefix="sqlalchemy.", poolclass=pool.NullPool
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
