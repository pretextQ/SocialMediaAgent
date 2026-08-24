"""内容查询接口。"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from socialmedia_agent.domain.content import Content
from socialmedia_agent.repositories.content_repo import ContentRepository

from ..deps import get_session

router = APIRouter(prefix="/contents", tags=["contents"])


@router.get("", response_model=list[Content])
def list_contents(
    platform: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    session: Session = Depends(get_session),
) -> list[Content]:
    models = ContentRepository(session).list(platform=platform, limit=limit)
    return [model.to_domain() for model in models]


@router.get("/{content_id}", response_model=Content)
def get_content(content_id: str, session: Session = Depends(get_session)) -> Content:
    model = ContentRepository(session).get(content_id)
    if model is None:
        raise HTTPException(status_code=404, detail="content not found")
    return model.to_domain()
