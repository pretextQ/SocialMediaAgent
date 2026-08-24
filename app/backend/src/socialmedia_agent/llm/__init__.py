"""LLM 调用网关（P2，ADR-0002）。

统一 LLM 调用入口：text / json / pydantic 结构化输出，外层 tenacity 重试，内层熔断。
业务层只依赖本模块；不直接依赖任何第三方 LLM 项目代码。
"""

from __future__ import annotations

from socialmedia_agent.llm.circuit_breaker import CircuitBreaker
from socialmedia_agent.llm.gateway import LLMCallResult, LLMGateway
from socialmedia_agent.llm.providers import LLMProvider, OpenAICompatProvider

__all__ = [
    "CircuitBreaker",
    "LLMCallResult",
    "LLMGateway",
    "LLMProvider",
    "OpenAICompatProvider",
]
