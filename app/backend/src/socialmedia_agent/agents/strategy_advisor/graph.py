"""Strategy Advisor 图（P4-5）。

gather → analyze → persist → report → END；persist 将策略写入 Memory（读-写闭环）。
state 携带 account_id / facts / strategy / memory_saved / report。
"""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from socialmedia_agent.agents.strategy_advisor.nodes import analyze, gather, persist, render_report
from socialmedia_agent.agents.strategy_advisor.schemas import StrategyAdvisorOutput
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.llm.gateway import LLMGateway


class StrategyAdvisorState(TypedDict, total=False):
    account_id: str
    facts: dict
    strategy: StrategyAdvisorOutput
    memory_saved: dict
    report: str


def build_strategy_advisor_graph(registry: ToolRegistry, gateway: LLMGateway | None = None):
    def node_gather(state: StrategyAdvisorState) -> dict[str, Any]:
        return {"facts": gather(registry, state["account_id"])}

    def node_analyze(state: StrategyAdvisorState) -> dict[str, Any]:
        return {"strategy": analyze(gateway, state["facts"])}

    def node_persist(state: StrategyAdvisorState) -> dict[str, Any]:
        return {"memory_saved": persist(registry, state["strategy"])}

    def node_report(state: StrategyAdvisorState) -> dict[str, Any]:
        return {"report": render_report(state["strategy"], state["facts"])}

    graph = StateGraph(StrategyAdvisorState)
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
