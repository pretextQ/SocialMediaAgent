"""Title Optimization 图（P4-4）。

gather → analyze → report → END；state 携带 content_id/title / facts / optimization / report。
"""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from socialmedia_agent.agents.title_optimization.nodes import analyze, gather, render_report
from socialmedia_agent.agents.title_optimization.schemas import TitleOptimizationOutput
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.llm.gateway import LLMGateway


class TitleOptimizationState(TypedDict, total=False):
    content_id: str
    title: str
    facts: dict
    optimization: TitleOptimizationOutput
    report: str


def build_title_optimization_graph(registry: ToolRegistry, gateway: LLMGateway | None = None):
    def node_gather(state: TitleOptimizationState) -> dict[str, Any]:
        return {
            "facts": gather(
                registry,
                content_id=state.get("content_id"),
                title=state.get("title"),
            )
        }

    def node_analyze(state: TitleOptimizationState) -> dict[str, Any]:
        return {"optimization": analyze(gateway, state["facts"])}

    def node_report(state: TitleOptimizationState) -> dict[str, Any]:
        return {"report": render_report(state["optimization"], state["facts"])}

    graph = StateGraph(TitleOptimizationState)
    graph.add_node("gather", node_gather)
    graph.add_node("analyze", node_analyze)
    graph.add_node("report", node_report)
    graph.add_edge(START, "gather")
    graph.add_edge("gather", "analyze")
    graph.add_edge("analyze", "report")
    graph.add_edge("report", END)
    return graph.compile()
