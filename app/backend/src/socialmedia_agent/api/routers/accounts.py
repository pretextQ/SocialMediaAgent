"""账号查询接口。

**列表**读取统一走 `services.queries`（API 与 MCP 共用一份映射，见该模块说明）；
单条查询是简单主键读取，直接用 Repository。
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from socialmedia_agent.domain.account import Account
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.services import queries

from ..deps import get_session

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[Account])
def list_accounts(
    platform: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    session: Session = Depends(get_session),
) -> list[Account]:
    """账号列表。limit 显式暴露（默认 100，最大 500），与 /contents、/metrics 一致。

    此前该端点不接受 limit，结果被 Repository 默认值静默截断到 100 且无法调高
    （见 docs/issues.md #8）。
    """
    return queries.list_accounts(session, platform=platform, limit=limit)


@router.get("/{account_id}", response_model=Account)
def get_account(account_id: str, session: Session = Depends(get_session)) -> Account:
    model = AccountRepository(session).get(account_id)
    if model is None:
        raise HTTPException(status_code=404, detail="account not found")
    return model.to_domain()
