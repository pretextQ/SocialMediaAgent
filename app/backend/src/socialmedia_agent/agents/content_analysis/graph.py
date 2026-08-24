"""Content Analysis 图（P4-1）。

gather → analyze → report → END；state 携带 content_id / facts / analysis / report。
"""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from socialmedia_agent.agents.content_analysis.nodes import analyze, gather, render_report
from socialmedia_agent.agents.content_analysis.schemas import ContentAnalysisOutput
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.llm.gateway import LLMGateway


class ContentAnalysisState(TypedDict, total=False):
    content_id: str
    facts: dict
    analysis: ContentAnalysisOutput
    report: str


def build_content_analysis_graph(registry: ToolRegistry, gateway: LLMGateway | None = None):
    def node_gather(state: ContentAnalysisState) -> dict[str, Any]:
        return {"facts": gather(registry, state["content_id"])}

    def node_analyze(state: ContentAnalysisState) -> dict[str, Any]:
        return {"analysis": analyze(gateway, state["facts"])}

    def node_report(state: ContentAnalysisState) -> dict[str, Any]:
        return {"report": render_report(state["analysis"], state["facts"])}

    graph = StateGraph(ContentAnalysisState)
    graph.add_node("gather", node_gather)
    graph.add_node("analyze", node_analyze)
    graph.add_node("report", node_report)
    graph.add_edge(START, "gather")
    graph.add_edge("gather", "analyze")
    graph.add_edge("analyze", "report")
    graph.add_edge("report", END)
    return graph.compile()
