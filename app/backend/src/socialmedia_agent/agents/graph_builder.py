"""LangGraph 最小图：自然语言指令 → 路由 → 调用内部 Tool / 能力 → 结果写回 state。

路由实现见 `agents/router.py`：

- 默认 **rules**（正则，确定性对照，可测）；
- `agentic=True` 且注入 gateway 时由 **LLM function calling** 决定路由，失败**回退 rules**。

state 记录 `route_source`（llm / rules）与 `route_args`，让「谁做的路由、参数从哪来」可观测。

拓扑：route → 条件分支 →（有路由）exec_tool → END /（无路由）no_route → END。
"""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph
from pydantic import ValidationError

from socialmedia_agent.agents.account_strategy.graph import build_account_strategy_graph
from socialmedia_agent.agents.content_analysis.graph import build_content_analysis_graph
from socialmedia_agent.agents.router import (
    decide_route_llm,
    decide_route_rules,
    extract_account_id,
    extract_platform,
)
from socialmedia_agent.agents.state import AgentState
from socialmedia_agent.agents.title_optimization import nodes as title_capability
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.agents.topic_recommendation import nodes as topic_capability
from socialmedia_agent.agents.trend_analysis.graph import build_trend_analysis_graph
from socialmedia_agent.llm.gateway import LLMGateway

NO_ROUTE_HINT = "无法识别指令（规则与 LLM 路由均未命中）"


def build_minimal_graph(
    registry: ToolRegistry,
    gateway: LLMGateway | None = None,
    agentic: bool = False,
):
    """构建最小图：route → 条件分支 → exec_tool / no_route → END。

    agentic=True 且注入 gateway 时才由模型路由；**默认仍是确定性正则路由**
    （对照组的默认行为不允许被悄悄改掉，有守护测试）。
    """

    def node_route(state: AgentState) -> AgentState:
        text = state.get("input", "")
        decision = None
        if agentic and gateway is not None:
            decision = decide_route_llm(registry, gateway, text)
        if decision is None:
            decision = decide_route_rules(text)
        if decision is None:
            return {"tool_calls": [], "route_args": {}, "route_source": "rules"}
        return {
            "tool_calls": [decision.target],
            "route_args": decision.args,
            "route_source": decision.source,
        }

    def node_no_route(state: AgentState) -> AgentState:
        return {"result": NO_ROUTE_HINT}

    def node_exec(state: AgentState) -> AgentState:
        target = state["tool_calls"][0]
        args = state.get("route_args") or {}
        if target.startswith("agent:"):
            return {
                "result": _invoke_agent(
                    target[6:], registry, state.get("input", ""), gateway, args
                )
            }
        tool = registry.get(target)
        try:
            return {"result": tool.invoke(**args)}
        except ValidationError as exc:
            # 缺参不抛穿整张图：给人类可读提示（与能力派发的「缺少 … 参数」一致）
            missing = ", ".join(
                str(err["loc"][0]) for err in exc.errors() if err["type"] == "missing"
            )
            return {"result": f"缺少必要参数：{missing or target}"}

    def has_route(state: AgentState) -> str:
        return "exec" if state.get("tool_calls") else "no_route"

    graph = StateGraph(AgentState)
    graph.add_node("route", node_route)
    graph.add_node("exec_tool", node_exec)
    graph.add_node("no_route", node_no_route)
    graph.add_edge(START, "route")
    graph.add_conditional_edges(
        "route", has_route, {"exec": "exec_tool", "no_route": "no_route"}
    )
    graph.add_edge("exec_tool", END)
    graph.add_edge("no_route", END)
    return graph.compile()


def _invoke_agent(
    name: str,
    registry: ToolRegistry,
    text: str,
    gateway: LLMGateway | None = None,
    args: dict | None = None,
) -> dict | str:
    """按能力名派发：Agent 走 LangGraph 图；降级能力走 gather+analyze 直调。

    参数优先取路由给出的显式 args（LLM 路径），缺失时回退文本抽取（规则路径）。
    """
    args = args or {}
    cid = args.get("account_id") or args.get("content_id") or extract_account_id(text)

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
        platform = args.get("platform") or extract_platform(text) or "bilibili"
        period = int(args.get("period", 7))
        state = build_trend_analysis_graph(registry, gateway).invoke(
            {"platform": platform, "period": period}
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
