"""指标查询接口。"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from socialmedia_agent.domain.metric import Metric
from socialmedia_agent.repositories.metric_repo import MetricRepository

from ..deps import get_session

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("", response_model=list[Metric])
def list_metrics(
    content_id: str | None = Query(default=None),
    metric_type: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    session: Session = Depends(get_session),
) -> list[Metric]:
    models = MetricRepository(session).list(
        content_id=content_id, metric_type=metric_type, limit=limit
    )
    return [model.to_domain() for model in models]
