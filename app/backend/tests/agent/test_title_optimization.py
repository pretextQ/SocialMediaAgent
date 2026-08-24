"""Title Optimization Agent 测试（TDD，P4-4）。

覆盖：
- TitleOptimizationOutput 严格 schema：optimized_titles 固定 3 条（min/max 3）
- e2e（content_id 模式）：LLM 返回 3 条 → 原样采用
- e2e（原始标题模式）：不查库，直接用传入标题
- LLM 返回条数 != 3 → 规则兜底生成固定 3 条
- LLM 失败 → 规则兜底仍满足 schema
- 规则兜底确定性：3 条模板标题可精确断言
- 统计注入可核验（历史播放量 + 标题写作知识）
"""

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import sessionmaker

from socialmedia_agent.agents.title_optimization.graph import build_title_optimization_graph
from socialmedia_agent.agents.title_optimization.schemas import TitleOptimizationOutput
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
    db = Database(url=f"sqlite:///{tmp_path / 'title.db'}")
    db.create_all()
    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="90001", nickname="UP主A")
        )
        c = ContentRepository(session).upsert(
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
                content_id=c.canonical_id,
                account_id="bilibili:90001",
                platform=Platform.BILIBILI,
                metric_type=MetricType.VIEWS,
                value="1000",
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
        [{"title": "标题写作", "content": "B站标题写作方法：开头3秒钩子 + 数字 + 情绪词"}],
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
    def __init__(self, script: list[str]) -> None:
        self.script = script
        self.last_user_content: str | None = None

    def complete(self, messages: list[dict], response_format: str = "text") -> str:
        self.last_user_content = messages[-1]["content"]
        return self.script.pop(0)


def make_gateway(provider: LLMProvider) -> LLMGateway:
    return LLMGateway(
        provider=provider,
        breaker=CircuitBreaker(name="title", failure_threshold=3, recovery_timeout=60),
    )


def test_title_optimization_output_schema_strict():
    out = TitleOptimizationOutput(
        original="人工智能入门",
        optimized_titles=["A", "B", "C"],
        explanation="x",
    )
    assert len(out.optimized_titles) == 3

    with pytest.raises(ValidationError):
        TitleOptimizationOutput(
            original="t", optimized_titles=["A", "B"], explanation="x"
        )
    with pytest.raises(ValidationError):
        TitleOptimizationOutput(
            original="t", optimized_titles=["A", "B", "C", "D"], explanation="x"
        )
    with pytest.raises(ValidationError):
        TitleOptimizationOutput(optimized_titles=["A", "B", "C"], explanation="x")  # original 必填


def test_e2e_content_id_keeps_llm_three_titles(tmp_path):
    ctx, reg, db = make_context(tmp_path)
    provider = ScriptedProvider(
        [
            '{"original": "人工智能入门", "optimized_titles": '
            '["入门人工智能，3 个方法速成", "别再错过：人工智能入门", "人工智能入门｜看完秒懂"], '
            '"explanation": "基于标题写作知识优化"}'
        ]
    )
    graph = build_title_optimization_graph(registry=reg, gateway=make_gateway(provider))
    state = graph.invoke({"content_id": "bilibili:1001"})
    out = state["optimization"]
    assert out.original == "人工智能入门"
    assert len(out.optimized_titles) == 3
    assert out.optimized_titles[0] == "入门人工智能，3 个方法速成"
    assert state["report"]
    assert "人工智能入门" in state["report"]


def test_e2e_raw_title_mode(tmp_path):
    ctx, reg, db = make_context(tmp_path)
    provider = ScriptedProvider(
        [
            '{"original": "如何学Python", "optimized_titles": '
            '["学Python的3个捷径", "别再错过：Python入门", "Python学习｜看完秒懂"], '
            '"explanation": "结合标题写作知识"}'
        ]
    )
    graph = build_title_optimization_graph(registry=reg, gateway=make_gateway(provider))
    state = graph.invoke({"title": "如何学Python"})
    out = state["optimization"]
    assert out.original == "如何学Python"
    assert len(out.optimized_titles) == 3
    assert state["report"]


def test_llm_wrong_count_falls_back_to_rules(tmp_path):
    """LLM 只返回 2 条 → 校验失败 → 规则兜底固定 3 条。"""
    ctx, reg, db = make_context(tmp_path)
    provider = ScriptedProvider(
        ['{"original": "人工智能入门", "optimized_titles": ["A", "B"], "explanation": "x"}']
    )
    graph = build_title_optimization_graph(registry=reg, gateway=make_gateway(provider))
    state = graph.invoke({"content_id": "bilibili:1001"})
    out = state["optimization"]
    assert len(out.optimized_titles) == 3
    assert out.original == "人工智能入门"
    assert state["report"]


def test_rule_fallback_deterministic_templates(tmp_path):
    """gateway=None：规则兜底生成固定 3 条模板标题。"""
    ctx, reg, db = make_context(tmp_path)
    graph = build_title_optimization_graph(registry=reg, gateway=None)
    state = graph.invoke({"content_id": "bilibili:1001"})
    out = state["optimization"]
    assert out.original == "人工智能入门"
    assert out.optimized_titles == [
        "人工智能入门｜看完秒懂",
        "人工智能入门（3 个实用技巧）",
        "别再错过：人工智能入门",
    ]
    assert "标题写作知识" in out.explanation


def test_llm_failure_falls_back_to_rules(tmp_path):
    ctx, reg, db = make_context(tmp_path)
    provider = ScriptedProvider(["not-json"])
    graph = build_title_optimization_graph(registry=reg, gateway=make_gateway(provider))
    state = graph.invoke({"content_id": "bilibili:1001"})
    out = state["optimization"]
    assert len(out.optimized_titles) == 3
    assert out.original == "人工智能入门"
    assert state["report"]


def test_statistics_injected_into_prompt(tmp_path):
    """历史播放量（1000）与标题写作知识必须注入 LLM prompt。"""
    ctx, reg, db = make_context(tmp_path)
    provider = ScriptedProvider(
        [
            '{"original": "人工智能入门", "optimized_titles": ["A", "B", "C"], "explanation": "x"}'
        ]
    )
    graph = build_title_optimization_graph(registry=reg, gateway=make_gateway(provider))
    graph.invoke({"content_id": "bilibili:1001"})
    assert "1000" in provider.last_user_content
    assert "标题写作" in provider.last_user_content
