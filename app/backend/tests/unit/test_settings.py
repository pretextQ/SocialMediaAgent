"""Settings 配置层测试（TDD，P5.5.2）。

覆盖：
- 默认值（数据库/Memory/爬虫路径；LLM 密钥默认 None，不硬编码）
- 环境变量覆盖（SMA_DB_URL）
- .env 文件覆盖（LLM_API_KEY / SMA_DB_URL）
- 优先级：环境变量 > .env > 默认
"""

import pytest

from socialmedia_agent.config import Settings


def test_settings_defaults():
    s = Settings(_env_file=None)
    assert s.database_url.endswith("sma.db")
    assert s.memory_database_url.endswith("sma_memory.db")
    assert "crawler_service" in s.crawler_dir
    assert ".venv-crawler" in s.crawler_python
    assert s.llm_api_key is None  # 密钥不硬编码
    assert s.llm_model
    assert s.llm_timeout > 0


def test_settings_env_override(monkeypatch):
    monkeypatch.setenv("SMA_DB_URL", "sqlite:///other.db")
    s = Settings(_env_file=None)
    assert s.database_url == "sqlite:///other.db"


def test_settings_env_wins_over_dotenv(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text("SMA_DB_URL=sqlite:///dotenv.db\n", encoding="utf-8")
    monkeypatch.setenv("SMA_DB_URL", "sqlite:///env.db")
    s = Settings(_env_file=str(env_file))
    assert s.database_url == "sqlite:///env.db"


def test_settings_dotenv_override(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "LLM_API_KEY=sk-test-dotenv\nSMA_DB_URL=sqlite:///dotenv.db\n", encoding="utf-8"
    )
    s = Settings(_env_file=str(env_file))
    assert s.llm_api_key == "sk-test-dotenv"
    assert s.database_url == "sqlite:///dotenv.db"


def test_settings_llm_api_key_not_hardcoded():
    """默认（无 env/.env）时 LLM 密钥必须为 None，禁止代码内硬编码密钥。"""
    s = Settings(_env_file=None)
    assert s.llm_api_key is None
