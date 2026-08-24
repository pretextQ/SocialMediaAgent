"""账号诊断接口（P3）。

POST /api/v1/accounts/{account_id}/diagnosis
→ 运行 Account Diagnosis Agent（gather → analyze → report）
→ 返回 { diagnosis, report }
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from socialmedia_agent.agents.account_diagnosis.graph import build_diagnosis_graph
from socialmedia_agent.agents.tools.base import ToolContext
from socialmedia_agent.agents.tools.catalog import build_core_tools
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.database.session import Database
from socialmedia_agent.repositories.account_repo import AccountRepository

router = APIRouter(prefix="/accounts", tags=["diagnosis"])


@router.post("/{account_id}/diagnosis")
def diagnose_account(account_id: str, request: Request) -> dict:
    database: Database = request.app.state.database

    with database.session() as session:
        account = AccountRepository(session).list(canonical_id=account_id, limit=1)
    if not account:
        raise HTTPException(status_code=404, detail="account not found")

    ctx = ToolContext(database=database)
    registry = ToolRegistry()
    for tool in build_core_tools(ctx):
        registry.register(tool)

    graph = build_diagnosis_graph(registry, gateway=None)  # 规则兜底；LLM 增强后注入 gateway
    state = graph.invoke({"account_id": account_id})
    return {"diagnosis": state["diagnosis"].model_dump(), "report": state["report"]}
