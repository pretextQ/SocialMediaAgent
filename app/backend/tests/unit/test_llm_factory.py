"""LLM Gateway 工厂测试（TDD，P5.5.3）。

覆盖：
- 未配置 LLM_API_KEY → build_gateway 返回 None（调用方规则兜底）
- 配置密钥 → 返回 LLMGateway
- env 覆盖生效
"""

from socialmedia_agent.config import Settings, get_settings
from socialmedia_agent.llm.factory import build_gateway, build_role_gateway
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


# ---- 角色级 gateway（per-Agent model） ----


def test_build_gateway_uses_role_model_and_role_breaker_name():
    s = Settings(
        _env_file=None,
        llm_api_key="sk-test",
        llm_model="base-model",
        llm_model_trend_analysis="trend-model",
    )
    g = build_gateway(s, role="trend_analysis")
    assert g is not None
    assert g.provider.model == "trend-model"
    # 熔断器按角色命名：不同角色的熔断状态互相独立
    assert g.breaker.name == "llm:trend_analysis"


def test_build_gateway_role_without_override_uses_default_model():
    s = Settings(_env_file=None, llm_api_key="sk-test", llm_model="base-model")
    g = build_gateway(s, role="title_optimization")
    assert g is not None
    assert g.provider.model == "base-model"
    assert g.breaker.name == "llm:title_optimization"


def test_build_gateway_without_role_keeps_default_breaker_name():
    s = Settings(_env_file=None, llm_api_key="sk-test")
    g = build_gateway(s)
    assert g is not None
    assert g.breaker.name == "llm"


def test_build_gateway_role_returns_none_without_key():
    s = Settings(_env_file=None)
    assert build_gateway(s, role="content_analysis") is None


def test_build_role_gateway_treats_first_arg_as_role(monkeypatch):
    """build_role_gateway 的 role 必须落在 role 上，不能误当 settings 位置参数。

    这是刻意加的守护：build_gateway(settings, role) 若被直接当工厂用，
    build_role_gateway('account_strategy') 会把字符串塞给 settings 参数。
    """
    monkeypatch.setenv("LLM_API_KEY", "sk-env")
    monkeypatch.setenv("LLM_MODEL_ACCOUNT_STRATEGY", "strong-model")
    get_settings.cache_clear()
    try:
        g = build_role_gateway("account_strategy")
    finally:
        get_settings.cache_clear()
    assert g is not None
    assert g.provider.model == "strong-model"
    assert g.breaker.name == "llm:account_strategy"
