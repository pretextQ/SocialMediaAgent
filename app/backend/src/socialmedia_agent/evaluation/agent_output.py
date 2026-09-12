"""按 kind 运行真实 Agent，返回 (facts, report)。供 grounding / quality runner 复用。"""

from __future__ import annotations

from socialmedia_agent.agents.account_strategy import nodes as strategy_nodes
from socialmedia_agent.agents.content_analysis import nodes as content_nodes
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.llm.gateway import LLMGateway

SUPPORTED_KINDS = ("account", "content")


def run_agent_output(
    kind: str, target_id: str, registry: ToolRegistry, gateway: LLMGateway | None
) -> tuple[dict, str]:
    """跑指定 Agent，返回（注入模型的事实, 人类可读报告）。"""
    if kind == "account":
        facts = strategy_nodes.gather(registry, target_id)
        result = strategy_nodes.analyze(gateway, facts)
        return facts, strategy_nodes.render_report(result, facts)
    if kind == "content":
        facts = content_nodes.gather(registry, target_id)
        result = content_nodes.analyze(gateway, facts)
        return facts, content_nodes.render_report(result, facts)
    raise ValueError(f"未知的用例 kind: {kind!r}（应为 account 或 content）")
