"""MCP Server 测试（TDD，P5-3）。

验证：create_mcp_server 注册 8 个 Tool；call_tool 可实际调用（list_tools/call_tool 走异步）。
"""

import asyncio

from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.account import Account
from socialmedia_agent.domain.enums import Platform
from socialmedia_agent.memory.store import build_memory_store
from socialmedia_agent.repositories.account_repo import AccountRepository


def _tool_names(tools) -> list[str]:
    if isinstance(tools, tuple):
        tools = tools[0]
    return [t.name for t in tools]


def _result_text(result) -> str:
    """兼容 call_tool 返回的 (content, structured) 或 [TextContent] 两种形态。"""
    if isinstance(result, tuple):
        result = result[0]
    return "".join(getattr(item, "text", str(item)) for item in result)


def test_mcp_server_registers_8_tools(tmp_path):
    from socialmedia_agent.services.mcp_server import create_mcp_server

    db = Database(url=f"sqlite:///{tmp_path / 'srv.db'}")
    mem = build_memory_store(url=f"sqlite:///{tmp_path / 'srv_mem.db'}")
    mcp = create_mcp_server(db, mem)
    names = _tool_names(asyncio.run(mcp.list_tools()))
    assert names == [
        "account_strategy",
        "analyze_content",
        "analyze_trends",
        "recommend_topics",
        "optimize_title",
        "list_accounts",
        "list_contents",
    ]


def test_mcp_server_call_tool(tmp_path):
    from socialmedia_agent.services.mcp_server import create_mcp_server

    db = Database(url=f"sqlite:///{tmp_path / 'srv.db'}")
    db.create_all()
    with db.session() as session:
        AccountRepository(session).upsert(
            Account(platform=Platform.BILIBILI, platform_id="90001", nickname="UP主A")
        )
    mem = build_memory_store(url=f"sqlite:///{tmp_path / 'srv_mem.db'}")
    mcp = create_mcp_server(db, mem)

    r1 = asyncio.run(mcp.call_tool("list_accounts", {"platform": "bilibili"}))
    assert "UP主A" in _result_text(r1)

    r2 = asyncio.run(mcp.call_tool("account_strategy", {"account_id": "bilibili:90001"}))
    text = _result_text(r2)
    assert "account_health" in text
    assert "report" in text
