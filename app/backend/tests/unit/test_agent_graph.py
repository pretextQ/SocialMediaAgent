"""LangGraph 最小图（含工具调用）测试（TDD）。

验证：输入自然语言指令 → 解析 → 调用对应内部 Tool → 结果写回 state。
不依赖 LLM（P2 用规则路由，确定性可测；P3 换 LLM 决策）。
"""

import json

from socialmedia_agent.agents.graph_builder import build_minimal_graph
from socialmedia_agent.agents.state import AgentState
from socialmedia_agent.agents.tools.base import ToolContext
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.llm.circuit_breaker import CircuitBreaker
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.llm.providers import (
    ProviderToolCall,
    ProviderToolResult,
    ToolCallingProvider,
)


def make_context(tmp_path):
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

    db = Database(url=f"sqlite:///{tmp_path / 'graph.db'}")
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
        TopicRepository(session).upsert(
            Topic(keyword="效率工具测评", platforms=[Platform.BILIBILI], post_count=50)
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


def test_minimal_graph_calls_analyze_content_performance(tmp_path):
    """回归：该路由原先必然抛 ValidationError——_args_for 只给部分工具抽参数。"""
    ctx = make_context(tmp_path)
    state = run_graph(ctx, "内容表现分析 bilibili:90001")
    assert state["tool_calls"] == ["analyze_content_performance"]
    assert state["result"]["content_count"] == 1


def test_minimal_graph_tool_route_missing_param_returns_hint(tmp_path):
    """缺少必需参数时应给人类可读提示，而不是把 pydantic 异常抛穿整张图。"""
    ctx = make_context(tmp_path)
    state = run_graph(ctx, "内容表现分析")
    assert state["tool_calls"] == ["analyze_content_performance"]
    assert "缺少" in state["result"]


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


def test_minimal_graph_routes_content_analysis_agent(tmp_path):
    ctx = make_context(tmp_path)
    state = run_graph(ctx, "分析内容质量 bilibili:1001")
    assert state["tool_calls"] == ["agent:content_analysis"]
    result = state["result"]
    assert result["agent"] == "content_analysis"
    assert result["content_id"] == "bilibili:1001"
    assert 0 <= result["analysis"]["quality_score"] <= 100
    assert result["report"]


def test_minimal_graph_routes_trend_analysis_agent(tmp_path):
    ctx = make_context(tmp_path)
    state = run_graph(ctx, "bilibili 平台近 7 天趋势分析")
    assert state["tool_calls"] == ["agent:trend_analysis"]
    result = state["result"]
    assert result["agent"] == "trend_analysis"
    assert result["platform"] == "bilibili"
    assert 0 <= result["analysis"]["trend_score"] <= 100


def test_minimal_graph_routes_topic_recommendation_agent(tmp_path):
    ctx = make_context(tmp_path)
    state = run_graph(ctx, "为 bilibili:90001 推荐选题")
    assert state["tool_calls"] == ["agent:topic_recommendation"]
    result = state["result"]
    assert result["account_id"] == "bilibili:90001"
    assert isinstance(result["recommendation"]["topics"], list)
    assert result["report"]


def test_minimal_graph_routes_title_optimization_agent(tmp_path):
    ctx = make_context(tmp_path)
    state = run_graph(ctx, "优化 bilibili:1001 的标题")
    assert state["tool_calls"] == ["agent:title_optimization"]
    result = state["result"]
    assert result["content_id"] == "bilibili:1001"
    assert len(result["optimization"]["optimized_titles"]) == 3
    assert result["report"]


def test_minimal_graph_routes_account_strategy_agent(tmp_path):
    ctx = make_context(tmp_path)
    state = run_graph(ctx, "制定 bilibili:90001 运营策略")
    assert state["tool_calls"] == ["agent:account_strategy"]
    result = state["result"]
    assert result["account_id"] == "bilibili:90001"
    assert result["strategy"]["account_health"]
    assert result["strategy"]["strategy_summary"]
    assert result["report"]


def test_minimal_graph_routes_diagnosis_intent(tmp_path):
    ctx = make_context(tmp_path)
    state = run_graph(ctx, "账号诊断 bilibili:90001")
    assert state["tool_calls"] == ["agent:account_strategy"]
    assert state["result"]["strategy"]["account_health"] is not None


def test_minimal_graph_agent_missing_param_returns_hint(tmp_path):
    ctx = make_context(tmp_path)
    state = run_graph(ctx, "制定运营策略")
    assert state["tool_calls"] == ["agent:account_strategy"]
    assert "缺少" in state["result"]


# ---------------------------------------------------------------------------
# B1：LLM 路由（function calling）+ 正则对照组
# ---------------------------------------------------------------------------


class ScriptedRouteProvider(ToolCallingProvider):
    """complete_with_tools 按脚本返回，并记录调用轮次（用于守护「默认不问模型」）。"""

    def __init__(self, script: list, complete_response: str | None = None):
        self.script = list(script)
        self.tool_call_rounds = 0
        self.complete_calls = 0
        self._complete_response = complete_response or json.dumps(
            {
                "account_id": "bilibili:90001",
                "account_health": 66,
                "strengths": [],
                "weaknesses": [],
                "anomalies": [],
                "recommendations": [],
                "strategy_summary": "模型给的策略摘要",
                "weekly_plan": [],
                "kpis": [],
                "risks": [],
            },
            ensure_ascii=False,
        )

    def complete(self, messages, response_format: str = "text") -> str:
        self.complete_calls += 1
        return self._complete_response

    def complete_with_tools(self, messages, tools) -> ProviderToolResult:
        self.tool_call_rounds += 1
        step = self.script.pop(0)
        if isinstance(step, Exception):
            raise step
        return step


def make_gateway(provider) -> LLMGateway:
    return LLMGateway(
        provider=provider,
        breaker=CircuitBreaker(name="route", failure_threshold=99, recovery_timeout=60),
    )


def route_call(name: str, **args) -> ProviderToolResult:
    return ProviderToolResult(
        tool_calls=[ProviderToolCall(id=f"c-{name}", name=name, arguments=args)]
    )


def run_agentic(ctx, text: str, provider):
    graph = build_minimal_graph(
        make_registry(ctx), gateway=make_gateway(provider), agentic=True
    )
    return graph.invoke({"input": text, "tool_calls": [], "result": None})


def test_agentic_routing_uses_llm_decision(tmp_path):
    """agentic=True：由模型用 function calling 决定路由（这里选 account_strategy）。"""
    ctx = make_context(tmp_path)
    provider = ScriptedRouteProvider([route_call("account_strategy", account_id="bilibili:90001")])

    state = run_agentic(ctx, "账号诊断 bilibili:90001", provider)

    assert state["route_source"] == "llm"
    assert state["tool_calls"] == ["agent:account_strategy"]
    assert state["result"]["strategy"]["strategy_summary"] == "模型给的策略摘要"


def test_minimal_graph_default_does_not_use_llm_routing(tmp_path):
    """默认（agentic=False）必须仍是正则路由，且**一次都不问模型**。"""
    ctx = make_context(tmp_path)
    provider = ScriptedRouteProvider([])  # 若真走了 LLM 路由，空脚本会直接报错
    graph = build_minimal_graph(make_registry(ctx), gateway=make_gateway(provider))

    state = graph.invoke(
        {"input": "获取账号 bilibili:90001 的资料", "tool_calls": [], "result": None}
    )

    assert state["route_source"] == "rules"
    assert state["tool_calls"] == ["get_account_profile"]
    assert state["result"]["nickname"] == "UP主A"
    assert provider.tool_call_rounds == 0


def test_agentic_routing_falls_back_to_rules_on_llm_failure(tmp_path):
    """LLM 失败 -> 回退正则路由（route_source 如实标为 rules），不产出半份决策。"""
    ctx = make_context(tmp_path)
    provider = ScriptedRouteProvider([RuntimeError("boom")] * 4)  # 网关会重试 3 次

    state = run_agentic(ctx, "获取账号 bilibili:90001 的资料", provider)

    assert state["route_source"] == "rules"
    assert state["tool_calls"] == ["get_account_profile"]
    assert state["result"]["nickname"] == "UP主A"


def test_agentic_routing_rejects_invalid_arguments(tmp_path):
    """模型选对了函数但参数过不了 schema -> 视为路由失败，回退正则。"""
    ctx = make_context(tmp_path)
    provider = ScriptedRouteProvider([route_call("account_strategy")])  # 缺 account_id

    state = run_agentic(ctx, "制定 bilibili:90001 运营策略", provider)

    assert state["route_source"] == "rules"
    assert state["tool_calls"] == ["agent:account_strategy"]
    assert state["result"]["account_id"] == "bilibili:90001"


def test_agentic_routing_handles_instruction_regex_cannot_parse(tmp_path):
    """增量价值证明：口语化指令正则路由不到，LLM 能给出带参数的路由。"""
    ctx = make_context(tmp_path)
    text = "帮我看看那个 UP主 bilibili:90001 最近发了些什么"

    rules_state = run_graph(ctx, text)
    assert rules_state["tool_calls"] == []  # 前提：正则确实路由不了

    provider = ScriptedRouteProvider(
        [route_call("get_recent_contents", account_id="bilibili:90001", limit=5)]
    )
    state = run_agentic(ctx, text, provider)

    assert state["route_source"] == "llm"
    assert state["tool_calls"] == ["get_recent_contents"]
    assert isinstance(state["result"], list)
