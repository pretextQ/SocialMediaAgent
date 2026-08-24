"""LangGraph 最小图：自然语言指令 → 解析 → 调用内部 Tool → 结果写回 state。

P2 用确定性规则路由（不依赖 LLM），保证可测；P3 起由 LLM 决策调用哪个工具。
"""

from __future__ import annotations

import re

from langgraph.graph import END, START, StateGraph

from socialmedia_agent.agents.state import AgentState
from socialmedia_agent.agents.tools.registry import ToolRegistry

# 规则路由：指令关键词 → Tool 名（P2 确定性解析）
_ROUTING_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"账号.*资料|资料.*账号|账号信息"), "get_account_profile"),
    (re.compile(r"最近.*内容|内容列表|列出.*内容"), "get_recent_contents"),
    (re.compile(r"内容.*指标|指标.*内容"), "get_content_metrics"),
    (re.compile(r"内容.*表现|表现分析|性能分析"), "analyze_content_performance"),
    (re.compile(r"知识库|运营知识|检索.*知识"), "search_operation_knowledge"),
    (re.compile(r"趋势"), "get_trend_data"),
    (re.compile(r"历史.*策略|策略"), "get_historical_strategy"),
    (re.compile(r"沉淀.*记忆|记录.*策略|保存.*记忆"), "save_operation_memory"),
]


def _parse_instruction(text: str) -> str | None:
    for pattern, tool_name in _ROUTING_RULES:
        if pattern.search(text):
            return tool_name
    return None


def build_minimal_graph(registry: ToolRegistry):
    """构建 P2 最小图：parse → exec_tool → END。"""

    def parse(state: AgentState) -> AgentState:
        tool_name = _parse_instruction(state.get("input", ""))
        return {"tool_calls": [tool_name] if tool_name else []}

    def exec_tool(state: AgentState) -> AgentState:
        calls = state.get("tool_calls", [])
        if not calls:
            return {"result": "无法识别指令（P2 规则路由未命中）"}
        tool = registry.get(calls[0])
        result = tool.invoke(**_args_for(tool.name, state.get("input", "")))
        return {"result": result}

    graph = StateGraph(AgentState)
    graph.add_node("parse", parse)
    graph.add_node("exec_tool", exec_tool)
    graph.add_edge(START, "parse")
    graph.add_edge("parse", "exec_tool")
    graph.add_edge("exec_tool", END)
    return graph.compile()


def _args_for(tool_name: str, text: str) -> dict:
    """从指令文本中抽取 Tool 参数（P2 规则版；P3 起由 LLM 生成结构化参数）。"""
    if tool_name in ("get_account_profile", "get_recent_contents", "get_historical_strategy"):
        account_id = _extract_account_id(text)
        if account_id:
            args: dict = {"account_id": account_id}
            if tool_name == "get_recent_contents":
                args["limit"] = _extract_limit(text)
            return args
    if tool_name == "search_operation_knowledge":
        m = re.search(r"知识库[：:]\s*(.+)$", text)
        if m:
            return {"query": m.group(1).strip()}
        return {"query": text}
    if tool_name == "save_operation_memory":
        account_id = _extract_account_id(text)
        if not account_id:
            return {}
        content = re.sub(r"沉淀一条运营记忆|保存.*记忆|记录.*策略[：:]", "", text).strip()
        content = content.replace(account_id, "").strip("：: ,，")
        return {"account_id": account_id, "category": "strategy", "content": content}
    return {}


def _extract_account_id(text: str) -> str | None:
    m = re.search(r"([a-z]+:[0-9a-zA-Z]+)", text)
    return m.group(1) if m else None


def _extract_limit(text: str) -> int:
    m = re.search(r"(\d+)\s*条", text)
    return int(m.group(1)) if m else 10
