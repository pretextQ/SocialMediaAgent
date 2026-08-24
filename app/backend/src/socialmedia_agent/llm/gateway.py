"""LLMGateway：统一 LLM 调用（text/json/pydantic + 重试 + 熔断）。

返回显式 LLMCallResult，调用方通过 success/data/error 判断，不做异常吞没。
日志只记录调用元数据（format/模型），不记录 messages 内容与密钥。
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Type

from tenacity import RetryError, retry, stop_after_attempt, wait_fixed

from socialmedia_agent.llm.circuit_breaker import CircuitBreaker, CircuitBreakerOpen
from socialmedia_agent.llm.providers import LLMProvider

logger = logging.getLogger(__name__)


@dataclass
class LLMCallResult:
    success: bool
    data: object | None = None
    error: str | None = None


def clean_json_string(raw_text: str) -> str:
    """清理模型返回的 Markdown JSON 围栏。"""
    if not raw_text:
        return "{}"
    res = raw_text.strip()
    for fence in ("```json\n", "```json", "```\n", "```"):
        if res.startswith(fence):
            res = res[len(fence):]
        if res.endswith(fence.rstrip("\n")):
            res = res[: -len(fence.rstrip("\n"))]
    return res.strip().rstrip("`").strip()


class LLMGateway:
    def __init__(self, provider: LLMProvider, breaker: CircuitBreaker):
        self.provider = provider
        self.breaker = breaker

    def call(
        self,
        prompt: str,
        text: str,
        response_format: str = "text",
        response_model: Type | None = None,
        max_retries: int = 2,
    ) -> LLMCallResult:
        messages = [
            {"role": "system", "content": prompt},
            {"role": "user", "content": text},
        ]
        model_name = response_model.__name__ if response_model is not None else "-"
        logger.debug("LLM 调用开始 format=%s model=%s", response_format, model_name)

        def _attempt() -> str:
            try:
                return self.breaker.call(
                    self.provider.complete, messages, response_format=response_format
                )
            except CircuitBreakerOpen as exc:
                raise exc

        try:
            raw = retry(
                stop=stop_after_attempt(max_retries + 1),
                wait=wait_fixed(0),
                reraise=True,
            )(_attempt)()
        except CircuitBreakerOpen as exc:
            logger.warning("LLM 熔断开启: %s", exc)
            return LLMCallResult(success=False, error=str(exc))
        except RetryError:
            logger.warning("LLM 调用重试耗尽")
            return LLMCallResult(success=False, error="LLM 调用重试耗尽")
        except Exception as exc:
            logger.warning("LLM 调用失败 type=%s", type(exc).__name__)
            return LLMCallResult(success=False, error=f"LLM 调用失败: {exc}")

        if response_format != "json":
            logger.debug("LLM 调用成功 format=%s", response_format)
            return LLMCallResult(success=True, data=raw)

        try:
            parsed = json.loads(clean_json_string(raw))
        except json.JSONDecodeError as exc:
            logger.warning("LLM JSON 解析失败")
            return LLMCallResult(success=False, error=f"JSON 解析失败: {exc}")

        if response_model is not None:
            try:
                return LLMCallResult(success=True, data=response_model(**parsed))
            except Exception as exc:
                logger.warning("LLM 输出未通过 %s 校验", model_name)
                return LLMCallResult(success=False, error=f"Pydantic 校验失败: {exc}")

        logger.debug("LLM 调用成功 format=%s", response_format)
        return LLMCallResult(success=True, data=parsed)
