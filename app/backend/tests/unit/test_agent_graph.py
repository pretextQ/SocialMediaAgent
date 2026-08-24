"""LangGraph 最小图（含工具调用）测试（TDD）。

验证：输入自然语言指令 → 解析 → 调用对应内部 Tool → 结果写回 state。
不依赖 LLM（P2 用规则路由，确定性可测；P3 换 LLM 决策）。
"""

from socialmedia_agent.agents.graph_builder import build_minimal_graph
from socialmedia_agent.agents.state import AgentState
from socialmedia_agent.agents.tools.base import ToolContext
from socialmedia_agent.agents.tools.registry import ToolRegistry


def make_context(tmp_path):
    from socialmedia_agent.database.session import Database
    from socialmedia_agent.domain.account import Account
    from socialmedia_agent.domain.enums import Platform
    from socialmedia_agent.memory.store import SQLAlchemyMemoryStore
    from socialmedia_agent.memory.summarizer import Summarizer
    from socialmedia_agent.rag import HashEmbedder, InMemoryVectorStore, Retriever
    from socialmedia_agent.repositories.account_repo import AccountRepository

    db = Database(url=f"sqlite:///{tmp_path / 'graph.db'}")
    db.create_all()
    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="90001", nickname="UP主A")
        )

    store = InMemoryVectorStore()
    emb = HashEmbedder(dim=64)
    store.add(
        emb.embed_texts(["B站标题写作方法：开头3秒钩子 + 数字 + 情绪词"]),
        [{"title": "标题写作", "content": "B站标题写作方法"}],
        ids=["k1"],
    )

    from sqlalchemy.orm import sessionmaker
    from socialmedia_agent.database.engine import create_db_engine

    m_engine = create_db_engine(f"sqlite:///{tmp_path / 'mem.db'}")
    SQLAlchemyMemoryStore.create_all(m_engine)
    m_session = sessionmaker(bind=m_engine, expire_on_commit=False)()

    return ToolContext(
        database=db,
        retriever=Retriever(embedder=emb, store=store),
        memory_store=SQLAlchemyMemoryStore(m_session),
        summarizer=Summarizer(),
    )


def make_registry(context):
    from socialmedia_agent.agents.tools.catalog import build_core_tools

    reg = ToolRegistry()
    for tool in build_core_tools(context):
        reg.register(tool)
    return reg


def run_graph(context, user_input: str) -> AgentState:
    reg = make_registry(context)
    graph = build_minimal_graph(reg)
    return graph.invoke({"input": user_input, "tool_calls": [], "result": None})


def test_minimal_graph_calls_get_account_profile(tmp_path):
    ctx = make_context(tmp_path)
    state = run_graph(ctx, "获取账号 bilibili:90001 的资料")
    assert state["tool_calls"] == ["get_account_profile"]
    assert state["result"]["nickname"] == "UP主A"


def test_minimal_graph_calls_get_recent_contents(tmp_path):
    ctx = make_context(tmp_path)
    state = run_graph(ctx, "列出 bilibili:90001 最近 10 条内容")
    assert state["tool_calls"] == ["get_recent_contents"]
    assert isinstance(state["result"], list)


def test_minimal_graph_calls_search_knowledge(tmp_path):
    ctx = make_context(tmp_path)
    state = run_graph(ctx, "查一下运营知识库：B站标题怎么写")
    assert state["tool_calls"] == ["search_operation_knowledge"]
    assert state["result"][0]["payload"]["title"] == "标题写作"


def test_minimal_graph_unknown_instruction_returns_hint(tmp_path):
    ctx = make_context(tmp_path)
    state = run_graph(ctx, "今天天气怎么样")
    assert state["tool_calls"] == []
    assert "无法识别" in (state["result"] or "")


def test_minimal_graph_save_and_read_memory(tmp_path):
    ctx = make_context(tmp_path)
    reg = make_registry(ctx)
    graph = build_minimal_graph(reg)

    s1 = graph.invoke(
        {
            "input": "沉淀一条运营记忆 bilibili:90001：strategy 每周五发布长视频",
            "tool_calls": [],
            "result": None,
        }
    )
    assert s1["tool_calls"] == ["save_operation_memory"]

    s2 = graph.invoke(
        {"input": "查看账号 bilibili:90001 的历史策略", "tool_calls": [], "result": None}
    )
    assert s2["tool_calls"] == ["get_historical_strategy"]
    assert any("每周五发布长视频" in c for c in s2["result"]["strategy"])
