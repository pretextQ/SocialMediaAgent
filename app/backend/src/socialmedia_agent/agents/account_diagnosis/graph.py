"""Account Diagnosis 图（P3）。

gather → analyze → report → END；state 携带 account_id / facts / diagnosis / report。
"""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from socialmedia_agent.agents.account_diagnosis.nodes import analyze, gather, render_report
from socialmedia_agent.agents.account_diagnosis.schemas import DiagnosisOutput
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.llm.gateway import LLMGateway


class DiagnosisState(TypedDict, total=False):
    account_id: str
    facts: dict
    diagnosis: DiagnosisOutput
    report: str


def build_diagnosis_graph(registry: ToolRegistry, gateway: LLMGateway | None = None):
    def node_gather(state: DiagnosisState) -> dict[str, Any]:
        facts = gather(registry, state["account_id"])
        return {"facts": facts}

    def node_analyze(state: DiagnosisState) -> dict[str, Any]:
        return {"diagnosis": analyze(gateway, state["facts"])}

    def node_report(state: DiagnosisState) -> dict[str, Any]:
        return {"report": render_report(state["diagnosis"], state["facts"])}

    graph = StateGraph(DiagnosisState)
    graph.add_node("gather", node_gather)
    graph.add_node("analyze", node_analyze)
    graph.add_node("report", node_report)
    graph.add_edge(START, "gather")
    graph.add_edge("gather", "analyze")
    graph.add_edge("analyze", "report")
    graph.add_edge("report", END)
    return graph.compile()
