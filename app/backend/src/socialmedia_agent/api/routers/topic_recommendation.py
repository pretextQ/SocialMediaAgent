"""选题推荐接口（P4-3）。

POST /api/v1/accounts/{account_id}/topic-recommendation
→ 运行 Topic Recommendation Agent（gather → analyze → report）
→ 返回 { recommendation, report }
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from socialmedia_agent.agents.tools.base import ToolContext
from socialmedia_agent.agents.tools.catalog import build_core_tools
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.agents.topic_recommendation.graph import build_topic_recommendation_graph
from socialmedia_agent.database.session import Database
from socialmedia_agent.repositories.account_repo import AccountRepository

router = APIRouter(prefix="/accounts", tags=["topic_recommendation"])


@router.post("/{account_id}/topic-recommendation")
def recommend_topics(account_id: str, request: Request) -> dict:
    database: Database = request.app.state.database

    with database.session() as session:
        account = AccountRepository(session).list(canonical_id=account_id, limit=1)
    if not account:
        raise HTTPException(status_code=404, detail="account not found")

    ctx = ToolContext(database=database)
    registry = ToolRegistry()
    for tool in build_core_tools(ctx):
        registry.register(tool)

    graph = build_topic_recommendation_graph(registry, gateway=None)  # 规则兜底；LLM 增强后注入 gateway
    state = graph.invoke({"account_id": account_id})
    return {"recommendation": state["recommendation"].model_dump(), "report": state["report"]}
