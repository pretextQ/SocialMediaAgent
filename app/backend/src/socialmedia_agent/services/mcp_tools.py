"""MCP 内部 handler（P5.3/P5.5.1）：基于已验证内部 Tool/Agent 的能力封装。

每个 handler 都是纯函数（注入 registry / database），可独立单测；
FastMCP 层只负责工具注册与参数 schema（services/mcp_server.py）。
P5.5.1 收敛：账号诊断+策略合并为 run_account_strategy；选题/标题降级为内部能力直调。
"""

from __future__ import annotations

from socialmedia_agent.agents.account_strategy.graph import build_account_strategy_graph
from socialmedia_agent.agents.content_analysis.graph import build_content_analysis_graph
from socialmedia_agent.agents.title_optimization import nodes as title_capability
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.agents.topic_recommendation import nodes as topic_capability
from socialmedia_agent.agents.trend_analysis.graph import build_trend_analysis_graph
from socialmedia_agent.database.session import Database
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository


def run_account_strategy(
    registry: ToolRegistry, account_id: str, gateway: LLMGateway | None = None
) -> dict:
    state = build_account_strategy_graph(registry, gateway).invoke({"account_id": account_id})
    return {
        "strategy": state["strategy"].model_dump(),
        "memory_saved": state.get("memory_saved"),
        "report": state["report"],
    }


def run_analyze_content(
    registry: ToolRegistry, content_id: str, gateway: LLMGateway | None = None
) -> dict:
    state = build_content_analysis_graph(registry, gateway).invoke({"content_id": content_id})
    return {"analysis": state["analysis"].model_dump(), "report": state["report"]}


def run_analyze_trends(
    registry: ToolRegistry,
    platform: str,
    period: int = 7,
    gateway: LLMGateway | None = None,
) -> dict:
    state = build_trend_analysis_graph(registry, gateway).invoke(
        {"platform": platform, "period": period}
    )
    return {"analysis": state["analysis"].model_dump(), "report": state["report"]}


def run_recommend_topics(
    registry: ToolRegistry, account_id: str, gateway: LLMGateway | None = None
) -> dict:
    facts = topic_capability.gather(registry, account_id)
    recommendation = topic_capability.analyze(gateway, facts)
    return {
        "recommendation": recommendation.model_dump(),
        "report": topic_capability.render_report(recommendation, facts),
    }


def run_optimize_title(
    registry: ToolRegistry,
    content_id: str | None = None,
    title: str | None = None,
    gateway: LLMGateway | None = None,
) -> dict:
    if not content_id and not title:
        raise ValueError("content_id 与 title 至少提供一个")
    facts = title_capability.gather(registry, content_id=content_id, title=title)
    optimization = title_capability.analyze(gateway, facts)
    return {
        "optimization": optimization.model_dump(),
        "report": title_capability.render_report(optimization, facts),
    }


def run_list_accounts(database: Database, platform: str | None = None) -> list[dict]:
    with database.session() as session:
        models = AccountRepository(session).list(platform=platform, limit=100)
    return [m.to_domain().model_dump() for m in models]


def run_list_contents(
    database: Database, platform: str | None = None, limit: int = 20
) -> list[dict]:
    with database.session() as session:
        models = ContentRepository(session).list(platform=platform, limit=limit)
    return [m.to_domain().model_dump() for m in models]
