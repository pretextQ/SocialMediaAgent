"""Account Strategy 图（P5.5.1，合并 Diagnosis + Strategy）。

gather → analyze → persist → report → END；persist 将策略写入 Memory（读-写闭环）。
state 携带 account_id / facts / strategy / memory_saved / report。

两个来源字段并存且语义不同：
- `gather_source`：**取数阶段**由谁决策（llm 自主选工具 / rules 确定性 gather）；
- `analyze_source`：**分析阶段**结果由谁产出（llm 结构化输出 / rules 规则兜底）。
"""

from __future__ import annotations

from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from socialmedia_agent.agents.account_strategy.agentic import gather_agentic
from socialmedia_agent.agents.account_strategy.nodes import (
    analyze_with_source,
    gather,
    persist,
    render_report,
)
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
    analyze_source: str


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
        strategy, source = analyze_with_source(gateway, state["facts"])
        return {"strategy": strategy, "analyze_source": source}

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
