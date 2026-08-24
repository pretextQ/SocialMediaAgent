"""MCP Server（P5.3，P5.5.1 收敛为 7 个 Tool）。

- create_mcp_server(database, memory_store)：构造 FastMCP 实例（stdio 可运行）
- run_mcp_stdio()：命令行入口（stdio 传输）
- 工具清单（基于已验证能力，非机械移植）：
  account_strategy / analyze_content / analyze_trends / recommend_topics /
  optimize_title / list_accounts / list_contents
"""

from __future__ import annotations

from mcp.server.fastmcp import FastMCP

from socialmedia_agent.agents.tools.catalog import build_registry
from socialmedia_agent.database.session import Database
from socialmedia_agent.llm.factory import build_gateway
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.logging_config import setup_logging
from socialmedia_agent.memory.store import SQLAlchemyMemoryStore, build_memory_store
from socialmedia_agent.memory.summarizer import Summarizer
from socialmedia_agent.services import mcp_tools


def create_mcp_server(
    database: Database | None = None,
    memory_store: SQLAlchemyMemoryStore | None = None,
    gateway: LLMGateway | None = None,
) -> FastMCP:
    db = database or Database()
    mem = memory_store or build_memory_store()
    registry = build_registry(db, memory_store=mem, summarizer=Summarizer())

    mcp = FastMCP("SocialMediaAgent", instructions="多平台自媒体智能运营 Agent 能力集合")

    @mcp.tool()
    def account_strategy(account_id: str) -> dict:
        """账号健康诊断与运营策略：健康度、优势/不足/异常/建议、策略摘要、周计划、KPI、风险，并沉淀到 Memory。"""
        return mcp_tools.run_account_strategy(registry, account_id, gateway)

    @mcp.tool()
    def analyze_content(content_id: str) -> dict:
        """单条内容质量分析：质量评分、优势、不足、建议。"""
        return mcp_tools.run_analyze_content(registry, content_id, gateway)

    @mcp.tool()
    def analyze_trends(platform: str, period: int = 7) -> dict:
        """平台周期内趋势分析：热门话题、趋势评分与洞察。"""
        return mcp_tools.run_analyze_trends(registry, platform, period, gateway)

    @mcp.tool()
    def recommend_topics(account_id: str) -> dict:
        """为账号推荐选题（自动去重已有内容）。"""
        return mcp_tools.run_recommend_topics(registry, account_id, gateway)

    @mcp.tool()
    def optimize_title(content_id: str | None = None, title: str | None = None) -> dict:
        """标题优化：content_id 或原始标题，返回固定 3 条优化标题与说明。"""
        return mcp_tools.run_optimize_title(registry, content_id, title, gateway)

    @mcp.tool()
    def list_accounts(platform: str | None = None) -> list[dict]:
        """列出账号（可按平台过滤）。"""
        return mcp_tools.run_list_accounts(db, platform)

    @mcp.tool()
    def list_contents(platform: str | None = None, limit: int = 20) -> list[dict]:
        """列出内容（可按平台过滤）。"""
        return mcp_tools.run_list_contents(db, platform, limit)

    return mcp


def run_mcp_stdio() -> None:
    """stdio 传输入口：`python -m socialmedia_agent.services.mcp_server`。"""
    setup_logging()
    create_mcp_server(gateway=build_gateway()).run(transport="stdio")


if __name__ == "__main__":
    run_mcp_stdio()
