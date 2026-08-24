"""账号诊断接口（P3）。

POST /api/v1/accounts/{account_id}/diagnosis
→ 运行 Account Diagnosis Agent（gather → analyze → report）
→ 返回 { diagnosis, report }
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from socialmedia_agent.agents.account_diagnosis.graph import build_diagnosis_graph
from socialmedia_agent.agents.account_diagnosis.schemas import DiagnosisOutput
from socialmedia_agent.agents.tools.base import ToolContext
from socialmedia_agent.agents.tools.catalog import build_core_tools
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.database.session import Database
from socialmedia_agent.repositories.account_repo import AccountRepository

router = APIRouter(prefix="/accounts", tags=["diagnosis"])


class DiagnosisResponse(BaseModel):
    diagnosis: DiagnosisOutput
    report: str


@router.post(
    "/{account_id}/diagnosis",
    response_model=DiagnosisResponse,
    summary="账号健康诊断",
    description="运行 Account Diagnosis Agent（gather → analyze → report），返回结构化诊断 + 人类可读报告。gateway 未配置时走规则兜底。",
)
def diagnose_account(account_id: str, request: Request) -> DiagnosisResponse:
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
    return DiagnosisResponse(diagnosis=state["diagnosis"], report=state["report"])
