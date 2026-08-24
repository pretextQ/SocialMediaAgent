"""LLM Gateway 工厂测试（TDD，P5.5.3）。

覆盖：
- 未配置 LLM_API_KEY → build_gateway 返回 None（调用方规则兜底）
- 配置密钥 → 返回 LLMGateway
- env 覆盖生效
"""

from socialmedia_agent.config import Settings
from socialmedia_agent.llm.factory import build_gateway
from socialmedia_agent.llm.gateway import LLMGateway


def test_build_gateway_returns_none_without_key():
    s = Settings(_env_file=None)
    assert build_gateway(s) is None


def test_build_gateway_returns_gateway_with_key():
    s = Settings(_env_file=None, llm_api_key="sk-test")
    g = build_gateway(s)
    assert isinstance(g, LLMGateway)


def test_build_gateway_env_override(monkeypatch):
    monkeypatch.setenv("LLM_API_KEY", "sk-env")
    s = Settings(_env_file=None)
    assert build_gateway(s) is not None


def test_build_gateway_uses_configured_endpoint(monkeypatch):
    monkeypatch.setenv("LLM_BASE_URL", "https://custom.example/v1")
    monkeypatch.setenv("LLM_MODEL", "custom-model")
    s = Settings(_env_file=None)
    assert s.llm_base_url == "https://custom.example/v1"
    assert s.llm_model == "custom-model"
