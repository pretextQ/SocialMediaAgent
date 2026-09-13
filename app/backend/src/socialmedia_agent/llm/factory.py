"""LLM Gateway 工厂（P5.5.3）。

从 Settings 构建 LLMGateway；未配置 LLM_API_KEY 时返回 None（调用方走规则兜底）。
厂商 Provider（OpenAI 兼容端点）只在工厂内构造，Agent/Service/API 只依赖 LLMGateway 抽象。
"""

from __future__ import annotations

from socialmedia_agent.config import Settings, get_settings
from socialmedia_agent.llm.circuit_breaker import CircuitBreaker
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.llm.providers import OpenAICompatProvider


def build_gateway(
    settings: Settings | None = None, role: str | None = None
) -> LLMGateway | None:
    """按配置构建 gateway；无 LLM_API_KEY 返回 None（调用方规则兜底）。

    role 非空时使用该角色配置的模型（见 `Settings.model_for`），并给熔断器一个
    角色化的 name —— 不同角色的熔断状态相互独立，互不干扰。
    """
    s = settings or get_settings()
    if not s.llm_api_key:
        return None
    provider = OpenAICompatProvider(
        api_key=s.llm_api_key,
        base_url=s.llm_base_url,
        model=s.model_for(role),
        timeout=s.llm_timeout,
    )
    breaker = CircuitBreaker(
        name=f"llm:{role}" if role else "llm",
        failure_threshold=5,
        recovery_timeout=30.0,
    )
    return LLMGateway(provider=provider, breaker=breaker)


def build_role_gateway(role: str) -> LLMGateway | None:
    """API 层按角色构建 gateway 的入口（注入为 app.state.gateway_factory）。

    独立函数而不是直接传 build_gateway：避免调用方误把 role 当成 settings 位置参数。
    """
    return build_gateway(role=role)
