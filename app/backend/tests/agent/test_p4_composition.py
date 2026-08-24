"""P4/P5.5 组合调用 e2e（DoD：可组合调用）。

验证 3 个核心 Agent + 2 个内部能力连续调用可组合、account/content 关联一致：
Account Strategy（合并诊断+策略）→ 内容分析 → 选题推荐 → 标题优化，
策略沉淀到 Memory；最小图 Agent 级路由组合。
"""

from sqlalchemy.orm import sessionmaker

from socialmedia_agent.agents.account_strategy.graph import build_account_strategy_graph
from socialmedia_agent.agents.content_analysis.graph import build_content_analysis_graph
from socialmedia_agent.agents.title_optimization import nodes as title_capability
from socialmedia_agent.agents.tools.base import ToolContext
from socialmedia_agent.agents.tools.catalog import build_core_tools
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.agents.topic_recommendation import nodes as topic_capability
from socialmedia_agent.database.engine import create_db_engine
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, MetricSource, MetricType, Platform
from socialmedia_agent.domain.metric import Metric
from socialmedia_agent.domain.topic import Topic
from socialmedia_agent.memory.store import SQLAlchemyMemoryStore
from socialmedia_agent.memory.summarizer import Summarizer
from socialmedia_agent.rag import HashEmbedder, InMemoryVectorStore, Retriever
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.metric_repo import MetricRepository
from socialmedia_agent.repositories.topic_repo import TopicRepository

ACCT = "bilibili:90001"
C1 = "bilibili:1001"


def make_context(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'compose.db'}")
    db.create_all()
    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="90001", nickname="UP主A")
        )
        c1 = ContentRepository(session).upsert(
            Content(
                platform=Platform.BILIBILI,
                platform_content_id="1001",
                account_id=ACCT,
                title="人工智能入门",
                content_type=ContentType.VIDEO,
            )
        )
        c2 = ContentRepository(session).upsert(
            Content(
                platform=Platform.BILIBILI,
                platform_content_id="1002",
                account_id=ACCT,
                title="AI 绘画教程",
                content_type=ContentType.VIDEO,
            )
        )
        for cid, views in ((c1.canonical_id, "1000"), (c2.canonical_id, "500")):
            MetricRepository(session).upsert(
                Metric(
                    content_id=cid,
                    account_id=ACCT,
                    platform=Platform.BILIBILI,
                    metric_type=MetricType.VIEWS,
                    value=views,
                    captured_at="2026-08-24T10:00:00Z",
                    source=MetricSource.MEDIACRAWLER,
                )
            )
        TopicRepository(session).upsert(
            Topic(keyword="效率工具测评", platforms=[Platform.BILIBILI], post_count=50)
        )

    store = InMemoryVectorStore()
    emb = HashEmbedder(dim=64)
    store.add(
        emb.embed_texts(["运营策略：稳定更新 + 内容差异化 + 数据复盘"]),
        [{"title": "运营策略", "content": "运营策略：稳定更新 + 内容差异化 + 数据复盘"}],
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
    return ctx, reg


def test_composed_agents_workflow(tmp_path):
    ctx, reg = make_context(tmp_path)

    # 1. Account Strategy（合并诊断 + 策略，写 Memory）
    st = build_account_strategy_graph(reg, None).invoke({"account_id": ACCT})
    # 2. 内容分析
    ca = build_content_analysis_graph(reg, None).invoke({"content_id": C1})
    # 3. 选题推荐（内部能力）
    rec_facts = topic_capability.gather(reg, ACCT)
    rec = topic_capability.analyze(None, rec_facts)
    # 4. 标题优化（内部能力）
    opt_facts = title_capability.gather(reg, content_id=C1)
    opt = title_capability.analyze(None, opt_facts)

    # 契约与关联一致性
    assert st["facts"]["account_id"] == ACCT
    assert 0 <= st["strategy"].account_health <= 100
    assert st["strategy"].strategy_summary
    assert st["report"]

    assert ca["analysis"].content_id == C1
    assert ca["facts"]["content"]["account_id"] == ACCT
    assert 0 <= ca["analysis"].quality_score <= 100
    assert ca["report"]

    assert rec.account_id == ACCT
    assert isinstance(rec.topics, list)
    assert topic_capability.render_report(rec, rec_facts)

    assert opt.original == "人工智能入门"
    assert len(opt.optimized_titles) == 3
    assert title_capability.render_report(opt, opt_facts)

    # 策略沉淀到 Memory（读-写闭环）
    entries = ctx.memory_store.list_for_account(ACCT)
    assert any(e.content == st["strategy"].strategy_summary for e in entries)


def test_composed_via_minimal_graph(tmp_path):
    """经最小图组合：趋势分析 → 选题推荐 连续指令可组合。"""
    ctx, reg = make_context(tmp_path)
    from socialmedia_agent.agents.graph_builder import build_minimal_graph

    graph = build_minimal_graph(reg)
    s1 = graph.invoke({"input": "bilibili 平台近 7 天趋势分析", "tool_calls": [], "result": None})
    assert s1["tool_calls"] == ["agent:trend_analysis"]
    s2 = graph.invoke({"input": "为 bilibili:90001 推荐选题", "tool_calls": [], "result": None})
    assert s2["tool_calls"] == ["agent:topic_recommendation"]
    assert s2["result"]["account_id"] == ACCT
