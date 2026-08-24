"""Account Diagnosis Agent 测试（TDD，P3）。

覆盖：
- DiagnosisOutput 严格 schema（account_health 0-100，四个 list 字段，缺字段报错）
- 端到端：account_id → gather 取数 → LLM 结构化输出 → 人类报告
- LLM 失败/非法输出 → 规则兜底仍满足 schema
- 统计数字核验：LLM prompt 包含 DB 事实
- 人类报告非空
"""

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import sessionmaker

from socialmedia_agent.agents.account_diagnosis.graph import build_diagnosis_graph
from socialmedia_agent.agents.account_diagnosis.schemas import DiagnosisOutput
from socialmedia_agent.database.engine import create_db_engine
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, MetricSource, MetricType, Platform
from socialmedia_agent.domain.metric import Metric
from socialmedia_agent.llm.circuit_breaker import CircuitBreaker
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.llm.providers import LLMProvider
from socialmedia_agent.memory.store import SQLAlchemyMemoryStore
from socialmedia_agent.memory.summarizer import Summarizer
from socialmedia_agent.rag import HashEmbedder, InMemoryVectorStore, Retriever
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.metric_repo import MetricRepository


def seed_db(tmp_path) -> Database:
    db = Database(url=f"sqlite:///{tmp_path / 'diag.db'}")
    db.create_all()
    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="90001", nickname="UP主A")
        )
        c1 = ContentRepository(session).upsert(
            Content(
                platform=Platform.BILIBILI,
                platform_content_id="1001",
                account_id="bilibili:90001",
                title="人工智能入门",
                content_type=ContentType.VIDEO,
            )
        )
        c2 = ContentRepository(session).upsert(
            Content(
                platform=Platform.BILIBILI,
                platform_content_id="1002",
                account_id="bilibili:90001",
                title="AI 绘画教程",
                content_type=ContentType.VIDEO,
            )
        )
        for cid, views in ((c1.canonical_id, "1000"), (c2.canonical_id, "500")):
            MetricRepository(session).upsert(
                Metric(
                    content_id=cid,
                    account_id="bilibili:90001",
                    platform=Platform.BILIBILI,
                    metric_type=MetricType.VIEWS,
                    value=views,
                    captured_at="2026-08-24T10:00:00Z",
                    source=MetricSource.MEDIACRAWLER,
                )
            )
    return db


def make_context(tmp_path):
    from socialmedia_agent.agents.tools.base import ToolContext
    from socialmedia_agent.agents.tools.catalog import build_core_tools
    from socialmedia_agent.agents.tools.registry import ToolRegistry

    db = seed_db(tmp_path)

    store = InMemoryVectorStore()
    emb = HashEmbedder(dim=64)
    store.add(
        emb.embed_texts(["B站标题写作方法：开头3秒钩子 + 数字 + 情绪词"]),
        [{"title": "标题写作", "content": "B站标题写作方法"}],
        ids=["k1"],
    )

    m_engine = create_db_engine(f"sqlite:///{tmp_path / 'mem.db'}")
    SQLAlchemyMemoryStore.create_all(m_engine)
    m_session = sessionmaker(bind=m_engine, expire_on_commit=False)()

    ctx = ToolContext(
        database=db,
        retriever=Retriever(embedder=emb, store=store),
        memory_store=SQLAlchemyMemoryStore(m_session),
        summarizer=Summarizer(),
    )
    reg = ToolRegistry()
    for tool in build_core_tools(ctx):
        reg.register(tool)
    return ctx, reg, db


class ScriptedProvider(LLMProvider):
    """按脚本返回文本；记录收到的 user 内容以便核验 prompt 中的 DB 事实。"""

    def __init__(self, script: list[str]) -> None:
        self.script = script
        self.last_user_content: str | None = None

    def complete(self, messages: list[dict], response_format: str = "text") -> str:
        self.last_user_content = messages[-1]["content"]
        return self.script.pop(0)


def make_gateway(provider: LLMProvider) -> LLMGateway:
    return LLMGateway(
        provider=provider,
        breaker=CircuitBreaker(name="diag", failure_threshold=3, recovery_timeout=60),
    )


def test_diagnosis_output_schema_strict():
    out = DiagnosisOutput(
        account_health=72,
        strengths=["更新稳定"],
        weaknesses=["互动率低"],
        anomalies=["播放量连续下跌"],
        recommendations=["优化标题"],
    )
    assert 0 <= out.account_health <= 100
    assert isinstance(out.strengths, list)

    with pytest.raises(ValidationError):
        DiagnosisOutput(account_health=200, strengths=[], weaknesses=[], anomalies=[], recommendations=[])
    with pytest.raises(ValidationError):
        DiagnosisOutput(account_health=50, strengths="not-list", weaknesses=[], anomalies=[], recommendations=[])

    # 四个 list 字段允许缺省（default_factory），但 account_health 必须合法
    out2 = DiagnosisOutput(account_health=50)
    assert out2.strengths == [] and out2.recommendations == []


def test_diagnosis_end_to_end(tmp_path):
    ctx, reg, db = make_context(tmp_path)
    provider = ScriptedProvider(
        [
            '{"account_health": 65, "strengths": ["更新稳定"], "weaknesses": ["互动率低"], '
            '"anomalies": ["播放量连续下跌"], "recommendations": ["优化标题"]}'
        ]
    )
    graph = build_diagnosis_graph(registry=reg, gateway=make_gateway(provider))
    state = graph.invoke({"account_id": "bilibili:90001"})
    assert isinstance(state["diagnosis"], DiagnosisOutput)
    assert state["diagnosis"].account_health == 65
    assert state["diagnosis"].strengths == ["更新稳定"]
    assert state["report"]  # 人类报告非空
    assert "UP主A" in state["report"]


def test_statistics_injected_into_prompt(tmp_path):
    """DB 事实（total_views=1500, content_count=2）必须注入 LLM prompt。"""
    ctx, reg, db = make_context(tmp_path)
    provider = ScriptedProvider(
        [
            '{"account_health": 60, "strengths": [], "weaknesses": [], '
            '"anomalies": [], "recommendations": []}'
        ]
    )
    graph = build_diagnosis_graph(registry=reg, gateway=make_gateway(provider))
    graph.invoke({"account_id": "bilibili:90001"})
    assert "1500" in provider.last_user_content
    assert "content_count" in provider.last_user_content or "2 条" in provider.last_user_content


def test_llm_failure_falls_back_to_rules(tmp_path):
    """LLM 返回非法 JSON → 规则兜底仍产出满足 schema 的诊断。"""
    ctx, reg, db = make_context(tmp_path)
    provider = ScriptedProvider(["not-json"])
    graph = build_diagnosis_graph(registry=reg, gateway=make_gateway(provider))
    state = graph.invoke({"account_id": "bilibili:90001"})
    assert isinstance(state["diagnosis"], DiagnosisOutput)
    assert 0 <= state["diagnosis"].account_health <= 100
    assert isinstance(state["diagnosis"].recommendations, list)
    assert state["report"]


def test_report_mentions_structured_fields(tmp_path):
    ctx, reg, db = make_context(tmp_path)
    provider = ScriptedProvider(
        [
            '{"account_health": 45, "strengths": ["更新稳定"], "weaknesses": ["互动率低"], '
            '"anomalies": ["播放量连续下跌"], "recommendations": ["优化标题", "增加弹幕互动"]}'
        ]
    )
    graph = build_diagnosis_graph(registry=reg, gateway=make_gateway(provider))
    state = graph.invoke({"account_id": "bilibili:90001"})
    report = state["report"]
    assert "45" in report
    assert "更新稳定" in report
    assert "优化标题" in report
    assert "增加弹幕互动" in report
