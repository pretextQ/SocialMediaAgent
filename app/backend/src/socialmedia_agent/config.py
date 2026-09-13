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
        populate_by_name=True,  # 允许 Settings(llm_api_key=...) 字段名与 env 别名 LLM_API_KEY 两用
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

    # RAG 知识库（P5.5.4）
    knowledge_store_path: str = Field(
        default=str(BACKEND_DIR / "data" / "knowledge" / "knowledge.index"),
        alias="SMA_KNOWLEDGE_STORE",
    )
    # 嵌入模型；未配置或未设 LLM_API_KEY 时回退 HashEmbedder（确定性，无外部依赖）
    embedding_model: str | None = Field(default=None, alias="SMA_EMBEDDING_MODEL")

    # 周报落盘目录（P5-2 周报写入；GET /reports 与 GET /system/status 读取）
    report_dir: str = Field(
        default=str(BACKEND_DIR / "data" / "reports"),
        alias="SMA_REPORT_DIR",
    )

    # 报告投递通道（可选）：配置了 webhook URL 才注册该通道；留空=只有文件落盘
    notify_webhook_url: str | None = Field(default=None, alias="SMA_NOTIFY_WEBHOOK_URL")

    # 各 Agent 角色的模型覆盖（可选）。借鉴 MediaRadar「默认模型 + 角色独立配置」的做法：
    # 推理重的角色可用强模型，轻量角色可用更快/更便宜的模型；未配置的角色回落 llm_model。
    llm_model_account_strategy: str | None = Field(
        default=None, alias="LLM_MODEL_ACCOUNT_STRATEGY"
    )
    llm_model_content_analysis: str | None = Field(
        default=None, alias="LLM_MODEL_CONTENT_ANALYSIS"
    )
    llm_model_trend_analysis: str | None = Field(
        default=None, alias="LLM_MODEL_TREND_ANALYSIS"
    )
    llm_model_topic_recommendation: str | None = Field(
        default=None, alias="LLM_MODEL_TOPIC_RECOMMENDATION"
    )
    llm_model_title_optimization: str | None = Field(
        default=None, alias="LLM_MODEL_TITLE_OPTIMIZATION"
    )

    @property
    def llm_model_overrides(self) -> dict[str, str]:
        """已**显式配置**的「角色 -> 模型」映射（未配置的角色不出现在结果里）。"""
        candidates: dict[str, str | None] = {
            "account_strategy": self.llm_model_account_strategy,
            "content_analysis": self.llm_model_content_analysis,
            "trend_analysis": self.llm_model_trend_analysis,
            "topic_recommendation": self.llm_model_topic_recommendation,
            "title_optimization": self.llm_model_title_optimization,
        }
        return {role: model for role, model in candidates.items() if model}

    def model_for(self, role: str | None) -> str:
        """取角色应使用的模型；role 为空或该角色未配置时回落 llm_model。"""
        if not role:
            return self.llm_model
        return self.llm_model_overrides.get(role, self.llm_model)


@lru_cache
def get_settings() -> Settings:
    """进程内单例；测试可用 Settings() 直接构造并覆盖 _env_file/env。"""
    return Settings()
