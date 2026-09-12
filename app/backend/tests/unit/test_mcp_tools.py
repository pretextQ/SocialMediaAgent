"""MCP 内部 handler 测试（TDD，P5-3）。

覆盖：8 个 MCP Tool 对应的纯 handler（基于已验证内部 Tool/Agent）：
诊断 / 内容分析 / 趋势 / 选题 / 标题优化 / 策略（写 Memory）/ 账号列表 / 内容列表。
"""

from socialmedia_agent.agents.tools.catalog import build_registry
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.content import Content
from socialmedia_agent.domain.enums import ContentType, MetricSource, MetricType, Platform
from socialmedia_agent.domain.metric import Metric
from socialmedia_agent.domain.topic import Topic
from socialmedia_agent.memory.store import build_memory_store
from socialmedia_agent.memory.summarizer import Summarizer
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.metric_repo import MetricRepository
from socialmedia_agent.repositories.topic_repo import TopicRepository


def make_ctx(tmp_path):
    db = Database(url=f"sqlite:///{tmp_path / 'mcp.db'}")
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
    mem = build_memory_store(url=f"sqlite:///{tmp_path / 'mem.db'}")
    return db, mem, build_registry(db, memory_store=mem, summarizer=Summarizer())


def test_mcp_account_strategy_handler(tmp_path):
    from socialmedia_agent.services.mcp_tools import run_account_strategy

    db, mem, reg = make_ctx(tmp_path)
    out = run_account_strategy(reg, "bilibili:90001")
    assert 0 <= out["strategy"]["account_health"] <= 100
    assert out["strategy"]["strategy_summary"]
    assert out["report"]


def test_mcp_content_analysis_handler(tmp_path):
    from socialmedia_agent.services.mcp_tools import run_analyze_content

    db, mem, reg = make_ctx(tmp_path)
    out = run_analyze_content(reg, "bilibili:1001")
    assert out["analysis"]["content_id"] == "bilibili:1001"
    assert 0 <= out["analysis"]["quality_score"] <= 100


def test_mcp_trend_analysis_handler(tmp_path):
    from socialmedia_agent.services.mcp_tools import run_analyze_trends

    db, mem, reg = make_ctx(tmp_path)
    out = run_analyze_trends(reg, "bilibili", 7)
    assert out["analysis"]["platform"] == "bilibili"
    assert 0 <= out["analysis"]["trend_score"] <= 100


def test_mcp_topic_recommendation_handler(tmp_path):
    from socialmedia_agent.services.mcp_tools import run_recommend_topics

    db, mem, reg = make_ctx(tmp_path)
    out = run_recommend_topics(reg, "bilibili:90001")
    assert isinstance(out["recommendation"]["topics"], list)
    assert out["report"]


def test_mcp_title_optimization_handler(tmp_path):
    from socialmedia_agent.services.mcp_tools import run_optimize_title

    db, mem, reg = make_ctx(tmp_path)
    out = run_optimize_title(reg, content_id="bilibili:1001")
    assert len(out["optimization"]["optimized_titles"]) == 3
    out2 = run_optimize_title(reg, title="如何学Python")
    assert out2["optimization"]["original"] == "如何学Python"


def test_mcp_strategy_handler_writes_memory(tmp_path):
    from socialmedia_agent.services.mcp_tools import run_account_strategy

    db, mem, reg = make_ctx(tmp_path)
    out = run_account_strategy(reg, "bilibili:90001")
    assert out["strategy"]["strategy_summary"]
    assert any(e.content == out["strategy"]["strategy_summary"] for e in mem.list_for_account("bilibili:90001"))


def test_mcp_list_accounts_and_contents(tmp_path):
    from socialmedia_agent.services.mcp_tools import run_list_accounts, run_list_contents

    db, mem, reg = make_ctx(tmp_path)
    accounts = run_list_accounts(db)
    assert len(accounts) == 1
    assert accounts[0]["nickname"] == "UP主A"
    contents = run_list_contents(db)
    assert len(contents) == 1
    assert contents[0]["title"] == "人工智能入门"


def test_mcp_list_accounts_honours_limit(tmp_path):
    """MCP 侧原先把 limit 硬编码成 100 且不可调，与 API 同样的隐性截断（issues.md #8）。"""
    from socialmedia_agent.services.mcp_tools import run_list_accounts

    db, mem, reg = make_ctx(tmp_path)
    with db.session() as session:
        repo = AccountRepository(session)
        for i in range(5):
            repo.upsert(
                Account(platform=Platform.WEIBO, platform_id=f"8{i:04d}", nickname=f"微博{i}")
            )

    assert len(run_list_accounts(db)) == 6
    assert len(run_list_accounts(db, limit=2)) == 2
