"""LLM Provider 抽象与 OpenAI 兼容实现。

- LLMProvider：业务层唯一依赖的接口。
- OpenAICompatProvider：适配 OpenAI 兼容端点（DeepSeek 等），可注入自定义 http 客户端用于测试。
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from openai import OpenAI


@dataclass
class ProviderToolCall:
    """模型请求的一次工具调用。"""

    id: str
    name: str
    arguments: dict


@dataclass
class ProviderToolResult:
    """一次 tool-calling 轮次的结果：要么要求调工具，要么给出最终文本。"""

    content: str | None = None
    tool_calls: list[ProviderToolCall] = field(default_factory=list)


class LLMProvider(ABC):
    @abstractmethod
    def complete(self, messages: list[dict], response_format: str = "text") -> str:
        """按 messages 调用模型，返回原始文本。response_format: text | json。"""


class ToolCallingProvider(LLMProvider):
    """支持 function calling 的 Provider。

    作为 LLMProvider 的**子类**新增，避免破坏既有只实现 complete() 的 Provider。
    """

    @abstractmethod
    def complete_with_tools(self, messages: list[dict], tools: list[dict]) -> ProviderToolResult:
        """带上工具 schema 调用模型，返回工具调用请求或最终文本。"""


class OpenAICompatProvider(ToolCallingProvider):
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

    def complete_with_tools(self, messages: list[dict], tools: list[dict]) -> ProviderToolResult:
        """OpenAI 兼容的 function calling：请求携带 tools，解析 tool_calls。"""
        kwargs: dict = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.2,
        }
        if tools:
            kwargs["tools"] = tools

        response = self._client.chat.completions.create(**kwargs)
        message = response.choices[0].message

        parsed: list[ProviderToolCall] = []
        for call in message.tool_calls or []:
            raw = call.function.arguments or "{}"
            try:
                arguments = json.loads(raw)
            except json.JSONDecodeError:
                # 参数不是合法 JSON：保留原文，交由上层记为工具执行失败
                arguments = {"_raw_arguments": raw}
            parsed.append(ProviderToolCall(id=call.id, name=call.function.name, arguments=arguments))

        return ProviderToolResult(content=message.content, tool_calls=parsed)
