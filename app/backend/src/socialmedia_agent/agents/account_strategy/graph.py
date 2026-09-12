"""Account Strategy 图（P5.5.1，合并 Diagnosis + Strategy）。

gather → analyze → persist → report → END；persist 将策略写入 Memory（读-写闭环）。
state 携带 account_id / facts / strategy / memory_saved / report。
"""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from socialmedia_agent.agents.account_strategy.agentic import gather_agentic
from socialmedia_agent.agents.account_strategy.nodes import analyze, gather, persist, render_report
from socialmedia_agent.agents.account_strategy.schemas import AccountStrategyOutput
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.llm.gateway import LLMGateway


class AccountStrategyState(TypedDict, total=False):
    account_id: str
    facts: dict
    strategy: AccountStrategyOutput
    memory_saved: dict
    report: str
    tool_trace: list[str]
    gather_source: str


def build_account_strategy_graph(
    registry: ToolRegistry,
    gateway: LLMGateway | None = None,
    agentic: bool = False,
):
    """agentic=True 时由 LLM 自主选择工具收集事实（失败自动回退确定性路径）。"""

    def node_gather(state: AccountStrategyState) -> dict[str, Any]:
        if agentic and gateway is not None:
            result = gather_agentic(registry, gateway, state["account_id"])
            return {
                "facts": result.facts,
                "tool_trace": result.tool_trace,
                "gather_source": result.source,
            }
        return {
            "facts": gather(registry, state["account_id"]),
            "tool_trace": [],
            "gather_source": "rules",
        }

    def node_analyze(state: AccountStrategyState) -> dict[str, Any]:
        return {"strategy": analyze(gateway, state["facts"])}

    def node_persist(state: AccountStrategyState) -> dict[str, Any]:
        return {"memory_saved": persist(registry, state["strategy"])}

    def node_report(state: AccountStrategyState) -> dict[str, Any]:
        return {"report": render_report(state["strategy"], state["facts"])}

    graph = StateGraph(AccountStrategyState)
    graph.add_node("gather", node_gather)
    graph.add_node("analyze", node_analyze)
    graph.add_node("persist", node_persist)
    graph.add_node("report", node_report)
    graph.add_edge(START, "gather")
    graph.add_edge("gather", "analyze")
    graph.add_edge("analyze", "persist")
    graph.add_edge("persist", "report")
    graph.add_edge("report", END)
    return graph.compile()
