"""LLM Gateway 工厂（P5.5.3）。

从 Settings 构建 LLMGateway；未配置 LLM_API_KEY 时返回 None（调用方走规则兜底）。
厂商 Provider（OpenAI 兼容端点）只在工厂内构造，Agent/Service/API 只依赖 LLMGateway 抽象。
"""

from __future__ import annotations

from socialmedia_agent.config import Settings, get_settings
from socialmedia_agent.llm.circuit_breaker import CircuitBreaker
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.llm.providers import OpenAICompatProvider


def build_gateway(settings: Settings | None = None) -> LLMGateway | None:
    """按配置构建 gateway；无 LLM_API_KEY 返回 None（调用方规则兜底）。"""
    s = settings or get_settings()
    if not s.llm_api_key:
        return None
    provider = OpenAICompatProvider(
        api_key=s.llm_api_key,
        base_url=s.llm_base_url,
        model=s.llm_model,
        timeout=s.llm_timeout,
    )
    breaker = CircuitBreaker(name="llm", failure_threshold=5, recovery_timeout=30.0)
    return LLMGateway(provider=provider, breaker=breaker)
