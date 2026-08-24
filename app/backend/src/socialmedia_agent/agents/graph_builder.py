"""LangGraph 最小图：自然语言指令 → 解析 → 调用内部 Tool / 能力 → 结果写回 state。

P2 用确定性规则路由（不依赖 LLM），保证可测；P3 起由 LLM 决策调用哪个工具。
P4-6 扩展：Agent 级指令（内容分析/趋势/账号策略）优先路由到对应 Agent 图；
P5.5.1 收敛：账号诊断+策略合并为 account_strategy；标题优化/选题推荐降级为内部能力（直接派发）。
"""

from __future__ import annotations

import re

from langgraph.graph import END, START, StateGraph

from socialmedia_agent.agents.account_strategy.graph import build_account_strategy_graph
from socialmedia_agent.agents.content_analysis.graph import build_content_analysis_graph
from socialmedia_agent.agents.state import AgentState
from socialmedia_agent.agents.title_optimization import nodes as title_capability
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.agents.topic_recommendation import nodes as topic_capability
from socialmedia_agent.agents.trend_analysis.graph import build_trend_analysis_graph
from socialmedia_agent.llm.gateway import LLMGateway

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

# Agent / 能力级路由（优先于 Tool 路由）；命中返回 "agent:<name>"
_AGENT_ROUTING_RULES: list[tuple[re.Pattern, str]] = [
    (re.compile(r"内容分析|分析.*内容质量|内容质量分析"), "content_analysis"),
    (re.compile(r"趋势分析|平台.*趋势|趋势.*平台"), "trend_analysis"),
    (re.compile(r"账号诊断|账号.*健康|运营策略|策略制定|策略.*建议|制定.*策略"), "account_strategy"),
    (re.compile(r"选题推荐|推荐.*选题|选题.*推荐"), "topic_recommendation"),
    (re.compile(r"标题优化|优化.*标题"), "title_optimization"),
]


def _parse_instruction(text: str) -> str | None:
    for pattern, name in _AGENT_ROUTING_RULES:
        if pattern.search(text):
            return f"agent:{name}"
    for pattern, tool_name in _ROUTING_RULES:
        if pattern.search(text):
            return tool_name
    return None


def build_minimal_graph(registry: ToolRegistry, gateway: LLMGateway | None = None):
    """构建最小图：parse → exec_tool → END（P4-6 支持 Agent 级指令）。"""

    def parse(state: AgentState) -> AgentState:
        target = _parse_instruction(state.get("input", ""))
        return {"tool_calls": [target] if target else []}

    def exec_tool(state: AgentState) -> AgentState:
        calls = state.get("tool_calls", [])
        if not calls:
            return {"result": "无法识别指令（P2 规则路由未命中）"}
        target = calls[0]
        text = state.get("input", "")
        if target.startswith("agent:"):
            return {"result": _invoke_agent(target[6:], registry, text, gateway)}
        tool = registry.get(target)
        result = tool.invoke(**_args_for(target, text))
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


_PLATFORM_RE = re.compile(
    r"(bilibili|douyin|xiaohongshu|kuaishou|weibo|zhihu|tieba|channels)"
)


def _extract_platform(text: str) -> str | None:
    m = _PLATFORM_RE.search(text)
    return m.group(1) if m else None


def _invoke_agent(
    name: str,
    registry: ToolRegistry,
    text: str,
    gateway: LLMGateway | None = None,
) -> dict:
    """按能力名派发：Agent 走 LangGraph 图；降级能力走 gather+analyze 直调。"""
    cid = _extract_account_id(text)

    if name == "content_analysis":
        if not cid:
            return "缺少 content_id 参数"
        state = build_content_analysis_graph(registry, gateway).invoke({"content_id": cid})
        return {
            "agent": "content_analysis",
            "content_id": cid,
            "analysis": state["analysis"].model_dump(),
            "report": state["report"],
        }
    if name == "trend_analysis":
        platform = _extract_platform(text) or "bilibili"
        state = build_trend_analysis_graph(registry, gateway).invoke(
            {"platform": platform, "period": 7}
        )
        return {
            "agent": "trend_analysis",
            "platform": platform,
            "analysis": state["analysis"].model_dump(),
            "report": state["report"],
        }
    if name == "account_strategy":
        if not cid:
            return "缺少 account_id 参数"
        state = build_account_strategy_graph(registry, gateway).invoke({"account_id": cid})
        return {
            "agent": "account_strategy",
            "account_id": cid,
            "strategy": state["strategy"].model_dump(),
            "memory_saved": state.get("memory_saved"),
            "report": state["report"],
        }
    if name == "topic_recommendation":
        if not cid:
            return "缺少 account_id 参数"
        facts = topic_capability.gather(registry, cid)
        recommendation = topic_capability.analyze(gateway, facts)
        return {
            "agent": "topic_recommendation",
            "account_id": cid,
            "recommendation": recommendation.model_dump(),
            "report": topic_capability.render_report(recommendation, facts),
        }
    if name == "title_optimization":
        if not cid:
            return "缺少 content_id 参数"
        facts = title_capability.gather(registry, content_id=cid)
        optimization = title_capability.analyze(gateway, facts)
        return {
            "agent": "title_optimization",
            "content_id": cid,
            "optimization": optimization.model_dump(),
            "report": title_capability.render_report(optimization, facts),
        }
    return f"未知能力：{name}"
