"""通用 Tool Calling 循环（M2）。

让模型**自己决定**调哪些工具，而不是固定调用一整套：
    messages -> 模型(带 tools) -> 有 tool_calls ?
        是 -> 执行工具 -> 结果回灌为 role=tool -> 回到模型
        否 -> 结束，content 即最终回答

设计约束：
- 工具只能经 ToolRegistry 执行，不直接访问数据库/第三方（AGENTS.md）。
- 超过 max_steps 仍未结束 => ok=False（让上层干净回退，不做静默截断）。
- 单个工具执行失败 => 记录错误并回灌给模型，循环继续（模型可自行调整）。
- gateway 调用失败 => ok=False，交由上层回退到确定性路径。
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any

from socialmedia_agent.agents.tools.base import Tool
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.llm.providers import ProviderToolCall, ProviderToolResult

logger = logging.getLogger(__name__)


@dataclass
class ToolCallRecord:
    """一次工具调用的完整记录（M3 用它计算工具选择正确率）。"""

    name: str
    arguments: dict
    ok: bool
    result: Any = None
    error: str | None = None


@dataclass
class ToolLoopResult:
    ok: bool
    final_message: str = ""
    tool_calls: list[ToolCallRecord] = field(default_factory=list)
    steps: int = 0
    error: str | None = None


def export_tool_schemas(tools: list[Tool]) -> list[dict]:
    """把内部 Tool 导出为 OpenAI function-calling 的 tools schema。"""
    return [
        {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.args_schema.model_json_schema(),
            },
        }
        for tool in tools
    ]


def _serialize(value: Any) -> str:
    """把工具结果序列化为回灌给模型的文本。"""
    try:
        return json.dumps(value, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        return str(value)


def _execute(registry: ToolRegistry, call: ProviderToolCall) -> ToolCallRecord:
    """执行一次工具调用，异常一律转成记录（不抛出，保证循环可继续）。"""
    try:
        tool = registry.get(call.name)
    except KeyError:
        logger.warning("模型请求了未注册的工具 name=%s", call.name)
        return ToolCallRecord(
            name=call.name, arguments=call.arguments, ok=False,
            error=f"未注册的工具: {call.name}",
        )
    try:
        value = tool.invoke(**call.arguments)
    except Exception as exc:  # noqa: BLE001 - 工具异常需回灌给模型，不能中断循环
        logger.warning("工具执行失败 name=%s type=%s", call.name, type(exc).__name__)
        return ToolCallRecord(
            name=call.name, arguments=call.arguments, ok=False,
            error=f"{type(exc).__name__}: {exc}",
        )
    return ToolCallRecord(name=call.name, arguments=call.arguments, ok=True, result=value)


def run_tool_loop(
    registry: ToolRegistry,
    gateway: LLMGateway,
    *,
    system_prompt: str,
    user_prompt: str,
    allowed_tools: list[str] | None = None,
    max_steps: int = 6,
) -> ToolLoopResult:
    """运行 tool-calling 循环，返回最终回答与完整调用记录。"""
    tools = registry.list()
    if allowed_tools is not None:
        allowed = set(allowed_tools)
        tools = [tool for tool in tools if tool.name in allowed]
    schemas = export_tool_schemas(tools)

    messages: list[dict] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    records: list[ToolCallRecord] = []

    for step in range(1, max_steps + 1):
        result = gateway.call_with_tools(messages, schemas)
        if not result.success:
            return ToolLoopResult(
                ok=False, tool_calls=records, steps=step,
                error=result.error or "LLM 调用失败",
            )

        payload = result.data
        if not isinstance(payload, ProviderToolResult):
            return ToolLoopResult(
                ok=False, tool_calls=records, steps=step, error="LLM 返回结构异常",
            )

        if not payload.tool_calls:
            return ToolLoopResult(
                ok=True, final_message=payload.content or "", tool_calls=records, steps=step,
            )

        messages.append({
            "role": "assistant",
            "content": payload.content or "",
            "tool_calls": [
                {
                    "id": call.id,
                    "type": "function",
                    "function": {
                        "name": call.name,
                        "arguments": json.dumps(call.arguments, ensure_ascii=False),
                    },
                }
                for call in payload.tool_calls
            ],
        })

        for call in payload.tool_calls:
            record = _execute(registry, call)
            records.append(record)
            messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "content": _serialize(record.result) if record.ok else f"工具执行失败：{record.error}",
            })

    return ToolLoopResult(
        ok=False, tool_calls=records, steps=max_steps,
        error=f"达到最大步数（{max_steps}）仍未结束",
    )
