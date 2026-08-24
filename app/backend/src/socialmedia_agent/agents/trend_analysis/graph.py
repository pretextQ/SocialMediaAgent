"""Trend Analysis 图（P4-2）。

gather → analyze → report → END；state 携带 platform / period / facts / analysis / report。
"""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.agents.trend_analysis.nodes import analyze, gather, render_report
from socialmedia_agent.agents.trend_analysis.schemas import TrendAnalysisOutput
from socialmedia_agent.llm.gateway import LLMGateway


class TrendAnalysisState(TypedDict, total=False):
    platform: str
    period: int
    facts: dict
    analysis: TrendAnalysisOutput
    report: str


def build_trend_analysis_graph(registry: ToolRegistry, gateway: LLMGateway | None = None):
    def node_gather(state: TrendAnalysisState) -> dict[str, Any]:
        return {"facts": gather(registry, state["platform"], state["period"])}

    def node_analyze(state: TrendAnalysisState) -> dict[str, Any]:
        return {"analysis": analyze(gateway, state["facts"])}

    def node_report(state: TrendAnalysisState) -> dict[str, Any]:
        return {"report": render_report(state["analysis"], state["facts"])}

    graph = StateGraph(TrendAnalysisState)
    graph.add_node("gather", node_gather)
    graph.add_node("analyze", node_analyze)
    graph.add_node("report", node_report)
    graph.add_edge(START, "gather")
    graph.add_edge("gather", "analyze")
    graph.add_edge("analyze", "report")
    graph.add_edge("report", END)
    return graph.compile()
