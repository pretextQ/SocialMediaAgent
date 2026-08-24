"""OpenAPI 文档完整性测试（P5-1）。

验证：/openapi.json 列出全部端点，且 Agent 端点在 OpenAPI 中暴露 response schema（自文档化）。
"""

from fastapi.testclient import TestClient

from socialmedia_agent.api.main import create_app
from socialmedia_agent.database.session import Database


def test_openapi_lists_all_endpoints_and_response_models(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'openapi.db'}")
    app = create_app(database=db)
    with TestClient(app) as client:
        resp = client.get("/openapi.json")
    db.engine.dispose()
    assert resp.status_code == 200
    spec = resp.json()
    paths = spec["paths"]

    expected_paths = [
        "/api/v1/accounts",
        "/api/v1/contents",
        "/api/v1/metrics",
        "/api/v1/accounts/{account_id}/diagnosis",
        "/api/v1/contents/{content_id}/analysis",
        "/api/v1/trends/analysis",
        "/api/v1/accounts/{account_id}/topic-recommendation",
        "/api/v1/titles/optimize",
        "/api/v1/accounts/{account_id}/strategy",
    ]
    for p in expected_paths:
        assert p in paths, f"缺失端点 {p}"

    defs = spec["components"]["schemas"]
    for name in [
        "DiagnosisResponse",
        "ContentAnalysisResponse",
        "TrendAnalysisResponse",
        "TopicRecommendationResponse",
        "TitleOptimizationResponse",
        "StrategyAdvisorResponse",
    ]:
        assert name in defs, f"缺失 response schema {name}"
