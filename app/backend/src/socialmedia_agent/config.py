"""配置层（P5.5.2，pydantic-settings 三层回退：默认 < .env < 环境变量）。

- 读取 app/backend/.env（gitignore）与 OS 环境变量
- 密钥（LLM_API_KEY 等）只从 env/.env 读取，代码不硬编码
- 新增配置项时同步更新 app/backend/.env.example
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_DIR.parent.parent
ENV_FILE = BACKEND_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # 核心库（SQLite）
    database_url: str = Field(
        default=f"sqlite:///{BACKEND_DIR / 'data' / 'sma.db'}",
        alias="SMA_DB_URL",
    )
    # Memory 独立库（与核心库物理分离，见架构约束）
    memory_database_url: str = Field(
        default=f"sqlite:///{BACKEND_DIR / 'data' / 'sma_memory.db'}",
        alias="SMA_MEMORY_DB_URL",
    )

    # MediaCrawler 隔离环境
    crawler_dir: str = Field(
        default=str(
            PROJECT_ROOT / "third_party" / "MediaRadar-main" / "backend" / "services" / "crawler_service"
        ),
        alias="SMA_MC_DIR",
    )
    crawler_python: str = Field(
        default=str(BACKEND_DIR / ".venv-crawler" / "Scripts" / "python.exe"),
        alias="SMA_MC_PYTHON",
    )
    crawler_db: str = Field(
        default=str(PROJECT_ROOT / "third_party" / "MediaRadar-main" / "backend" / "data" / "sqlite_tables.db"),
        alias="SMA_MC_DB",
    )

    # LLM（P5.5.3 注入；密钥仅从 env/.env 读取，默认 None = 规则兜底）
    llm_api_key: str | None = Field(default=None, alias="LLM_API_KEY")
    llm_base_url: str = Field(default="https://api.deepseek.com/v1", alias="LLM_BASE_URL")
    llm_model: str = Field(default="deepseek-chat", alias="LLM_MODEL")
    llm_timeout: float = Field(default=60.0, alias="LLM_TIMEOUT")


@lru_cache
def get_settings() -> Settings:
    """进程内单例；测试可用 Settings() 直接构造并覆盖 _env_file/env。"""
    return Settings()
