"""LangGraph 图状态定义。

P2 最小图 state：输入指令 → 工具调用记录 → 结果。
P3 起扩展 messages / 结构化输出等字段。
"""

from __future__ import annotations

from typing import Any, TypedDict


class AgentState(TypedDict, total=False):
    input: str
    tool_calls: list[str]
    route_args: dict[str, Any]
    route_source: str  # rules | llm —— 本次路由由谁决定（回退必须可观测）
    result: Any
