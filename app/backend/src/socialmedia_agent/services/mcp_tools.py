"""MCP 内部 handler（P5-3）：基于已验证内部 Tool/Agent 的能力封装。

每个 handler 都是纯函数（注入 registry / database），可独立单测；
FastMCP 层只负责工具注册与参数 schema（services/mcp_server.py）。
"""

from __future__ import annotations

from socialmedia_agent.agents.account_diagnosis.graph import build_diagnosis_graph
from socialmedia_agent.agents.content_analysis.graph import build_content_analysis_graph
from socialmedia_agent.agents.strategy_advisor.graph import build_strategy_advisor_graph
from socialmedia_agent.agents.title_optimization.graph import build_title_optimization_graph
from socialmedia_agent.agents.topic_recommendation.graph import build_topic_recommendation_graph
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.agents.trend_analysis.graph import build_trend_analysis_graph
from socialmedia_agent.database.session import Database
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository


def run_diagnosis(registry: ToolRegistry, account_id: str) -> dict:
    state = build_diagnosis_graph(registry, None).invoke({"account_id": account_id})
    return {"diagnosis": state["diagnosis"].model_dump(), "report": state["report"]}


def run_analyze_content(registry: ToolRegistry, content_id: str) -> dict:
    state = build_content_analysis_graph(registry, None).invoke({"content_id": content_id})
    return {"analysis": state["analysis"].model_dump(), "report": state["report"]}


def run_analyze_trends(registry: ToolRegistry, platform: str, period: int = 7) -> dict:
    state = build_trend_analysis_graph(registry, None).invoke(
        {"platform": platform, "period": period}
    )
    return {"analysis": state["analysis"].model_dump(), "report": state["report"]}


def run_recommend_topics(registry: ToolRegistry, account_id: str) -> dict:
    state = build_topic_recommendation_graph(registry, None).invoke({"account_id": account_id})
    return {"recommendation": state["recommendation"].model_dump(), "report": state["report"]}


def run_optimize_title(
    registry: ToolRegistry,
    content_id: str | None = None,
    title: str | None = None,
) -> dict:
    if not content_id and not title:
        raise ValueError("content_id 与 title 至少提供一个")
    state = build_title_optimization_graph(registry, None).invoke(
        {"content_id": content_id, "title": title}
    )
    return {"optimization": state["optimization"].model_dump(), "report": state["report"]}


def run_advise_strategy(registry: ToolRegistry, account_id: str) -> dict:
    state = build_strategy_advisor_graph(registry, None).invoke({"account_id": account_id})
    return {"strategy": state["strategy"].model_dump(), "report": state["report"]}


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
