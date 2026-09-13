"""系统状态聚合接口集成测试（GET /api/v1/system/status）。

覆盖：LLM 配置字段、路径字段、核心库 4 类计数、Memory 计数、RAG 文档计数、周报计数；
并验证 llm_configured 在「无 key」时为 False（用依赖覆盖，不依赖开发机 .env）。
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from socialmedia_agent.api.main import create_app
from socialmedia_agent.config import Settings, get_settings
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, MetricSource, MetricType, Platform
from socialmedia_agent.domain.metric import Metric
from socialmedia_agent.domain.topic import Topic
from socialmedia_agent.memory.models import MemoryCategory, MemoryEntry
from socialmedia_agent.memory.store import build_memory_store
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.metric_repo import MetricRepository
from socialmedia_agent.repositories.topic_repo import TopicRepository


class _FakeStore:
    def __init__(self, n: int) -> None:
        self._n = n

    def count(self) -> int:
        return self._n


class _FakeRetriever:
    """只需 store.count()：状态端点不检索，只看条数。"""

    def __init__(self, n: int) -> None:
        self.store = _FakeStore(n)


def _seed(db: Database) -> None:
    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="90001", nickname="UP主A")
        )
        content = ContentRepository(session).upsert(
            Content(
                platform=Platform.BILIBILI,
                platform_content_id="1001",
                account_id="bilibili:90001",
                title="人工智能入门",
                content_type=ContentType.VIDEO,
            )
        )
        MetricRepository(session).upsert(
            Metric(
                content_id=content.canonical_id,
                account_id="bilibili:90001",
                platform=Platform.BILIBILI,
                metric_type=MetricType.VIEWS,
                value="1000",
                captured_at="2026-08-24T10:00:00Z",
                source=MetricSource.MEDIACRAWLER,
            )
        )
        TopicRepository(session).upsert(
            Topic(keyword="AI 绘画", platforms=[Platform.BILIBILI], post_count=30)
        )


def _make(tmp_path, *, retriever=None, llm_key: str | None = None, report_dir=None):
    db = Database(url=f"sqlite:///{tmp_path / 'status.db'}")
    db.create_all()
    _seed(db)
    mem = build_memory_store(url=f"sqlite:///{tmp_path / 'status_mem.db'}")
    mem.add(
        MemoryEntry(
            account_id="bilibili:90001",
            category=MemoryCategory.STRATEGY,
            content="历史策略摘要",
        )
    )
    app = create_app(database=db, memory_store=mem, retriever=retriever)
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None,
        llm_api_key=llm_key,
        report_dir=str(report_dir if report_dir is not None else tmp_path / "reports"),
    )
    return app, db, mem


def test_system_status_aggregates_counts_and_paths(tmp_path):
    reports = tmp_path / "reports"
    reports.mkdir()
    (reports / "weekly_a.md").write_text("a", encoding="utf-8")
    (reports / "weekly_b.md").write_text("b", encoding="utf-8")
    (reports / "notes.txt").write_text("not-a-report", encoding="utf-8")

    app, db, mem = _make(
        tmp_path, retriever=_FakeRetriever(4), llm_key="sk-test", report_dir=reports
    )
    with TestClient(app) as client:
        resp = client.get("/api/v1/system/status")
    db.engine.dispose()
    mem.dispose()

    assert resp.status_code == 200
    body = resp.json()
    assert body["llm_configured"] is True
    assert body["account_count"] == 1
    assert body["content_count"] == 1
    assert body["metric_count"] == 1
    assert body["topic_count"] == 1
    assert body["memory_entry_count"] == 1
    assert body["knowledge_doc_count"] == 4  # 来自注入的 retriever.store.count()
    assert body["report_count"] == 2  # 只数 *.md
    assert body["report_dir"] == str(reports)
    assert body["database_url"] == db.url


def test_system_status_without_key_reports_not_configured(tmp_path):
    """llm_configured 跟随 settings.llm_api_key；无 key 时必须为 False。"""
    app, db, mem = _make(tmp_path, retriever=None, llm_key=None)
    with TestClient(app) as client:
        body = client.get("/api/v1/system/status").json()
    db.engine.dispose()
    mem.dispose()

    assert body["llm_configured"] is False
    assert body["llm_model"] == "deepseek-chat"  # Settings 默认值（_env_file=None）
    assert body["llm_base_url"] == "https://api.deepseek.com/v1"
    assert body["knowledge_doc_count"] == 0  # 无 retriever → 0，而不是报错


def test_system_status_missing_report_dir_is_zero(tmp_path):
    app, db, mem = _make(tmp_path, report_dir=tmp_path / "does_not_exist")
    with TestClient(app) as client:
        body = client.get("/api/v1/system/status").json()
    db.engine.dispose()
    mem.dispose()

    assert body["report_count"] == 0
