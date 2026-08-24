"""账号查询接口。"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from socialmedia_agent.domain.account import Account
from socialmedia_agent.repositories.account_repo import AccountRepository

from ..deps import get_session

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("", response_model=list[Account])
def list_accounts(
    platform: str | None = Query(default=None),
    session: Session = Depends(get_session),
) -> list[Account]:
    models = AccountRepository(session).list(platform=platform)
    return [model.to_domain() for model in models]


@router.get("/{account_id}", response_model=Account)
def get_account(account_id: str, session: Session = Depends(get_session)) -> Account:
    model = AccountRepository(session).get(account_id)
    if model is None:
        raise HTTPException(status_code=404, detail="account not found")
    return model.to_domain()
