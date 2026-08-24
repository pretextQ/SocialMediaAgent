"""Topic Recommendation 图（P4-3）。

gather → analyze → report → END；state 携带 account_id / facts / recommendation / report。
"""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.agents.topic_recommendation.nodes import analyze, gather, render_report
from socialmedia_agent.agents.topic_recommendation.schemas import TopicRecommendationOutput
from socialmedia_agent.llm.gateway import LLMGateway


class TopicRecommendationState(TypedDict, total=False):
    account_id: str
    facts: dict
    recommendation: TopicRecommendationOutput
    report: str


def build_topic_recommendation_graph(
    registry: ToolRegistry, gateway: LLMGateway | None = None
):
    def node_gather(state: TopicRecommendationState) -> dict[str, Any]:
        return {"facts": gather(registry, state["account_id"])}

    def node_analyze(state: TopicRecommendationState) -> dict[str, Any]:
        return {"recommendation": analyze(gateway, state["facts"])}

    def node_report(state: TopicRecommendationState) -> dict[str, Any]:
        return {"report": render_report(state["recommendation"], state["facts"])}

    graph = StateGraph(TopicRecommendationState)
    graph.add_node("gather", node_gather)
    graph.add_node("analyze", node_analyze)
    graph.add_node("report", node_report)
    graph.add_edge(START, "gather")
    graph.add_edge("gather", "analyze")
    graph.add_edge("analyze", "report")
    graph.add_edge("report", END)
    return graph.compile()
