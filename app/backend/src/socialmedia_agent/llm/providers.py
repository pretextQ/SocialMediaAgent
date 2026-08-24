"""LLM Provider 抽象与 OpenAI 兼容实现。

- LLMProvider：业务层唯一依赖的接口。
- OpenAICompatProvider：适配 OpenAI 兼容端点（DeepSeek 等），可注入自定义 http 客户端用于测试。
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from openai import OpenAI


class LLMProvider(ABC):
    @abstractmethod
    def complete(self, messages: list[dict], response_format: str = "text") -> str:
        """按 messages 调用模型，返回原始文本。response_format: text | json。"""


class OpenAICompatProvider(LLMProvider):
    def __init__(
        self,
        api_key: str,
        base_url: str,
        model: str,
        timeout: float = 60.0,
        http_client=None,
    ):
        self.model = model
        self._client = OpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=timeout,
            http_client=http_client,
        )

    def complete(self, messages: list[dict], response_format: str = "text") -> str:
        kwargs: dict = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.2 if response_format == "json" else 0.5,
        }
        if response_format == "json":
            kwargs["response_format"] = {"type": "json_object"}
        response = self._client.chat.completions.create(**kwargs)
        return response.choices[0].message.content or ""
