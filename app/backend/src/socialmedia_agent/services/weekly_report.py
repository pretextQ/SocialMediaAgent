"""周报服务（P5-2）。

build_weekly_report：聚合账号近 N 天表现（内容数/播放量，按 publish_time 过滤）
                     + 复用诊断/策略 Agent（健康度 + 策略摘要）→ 结构化摘要
render_weekly_report：确定性渲染 markdown
generate_all_weekly_reports：为全部账号生成并落盘
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

from socialmedia_agent.agents.account_strategy.graph import build_account_strategy_graph
from socialmedia_agent.agents.tools.catalog import build_registry
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.config import get_settings
from socialmedia_agent.database.session import Database
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.memory.store import SQLAlchemyMemoryStore
from socialmedia_agent.memory.summarizer import Summarizer
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.services.notifier import NotifierRegistry

logger = logging.getLogger(__name__)


def _registry(database: Database, memory_store: SQLAlchemyMemoryStore | None) -> ToolRegistry:
    return build_registry(
        database,
        memory_store=memory_store,
        summarizer=Summarizer() if memory_store else None,
    )


def _sum_views(registry: ToolRegistry, contents: list[dict]) -> Decimal:
    """把若干内容的 views 指标求和（经 Tool 取数，不直接查库）。"""
    total = Decimal("0")
    for content in contents:
        for metric in registry.invoke(
            "get_content_metrics", content_id=content["canonical_id"]
        ):
            if metric.get("metric_type") == "views":
                total += Decimal(metric.get("value", "0"))
    return total


def _change_pct(current: Decimal, previous: Decimal) -> float | None:
    """环比百分比；上期为 0 时返回 None。

    刻意不返回 0 或 +100%：上期没有数据时「增长率」没有定义，
    给出一个具体数字会比留空更误导。
    """
    if previous == 0:
        return None
    return float((current - previous) / previous * 100)


def _format_pct(value: float | None) -> str:
    """环比展示：None -> 明确说明无法计算；否则带符号百分比。"""
    if value is None:
        return "—（上期无数据，无法计算）"
    return f"{value:+.1f}%"


def build_weekly_report(
    database: Database,
    memory_store: SQLAlchemyMemoryStore | None,
    account_id: str,
    days: int = 7,
    gateway: LLMGateway | None = None,
) -> dict:
    """聚合账号近 days 天表现并复用 Account Strategy Agent，返回结构化周报摘要。"""
    reg = _registry(database, memory_store)
    profile = reg.invoke("get_account_profile", account_id=account_id) or {}
    # 取 100 条（Tool 上限）以同时覆盖「本周期」与「上一等长周期」两个窗口
    recent = reg.invoke("get_recent_contents", account_id=account_id, limit=100)

    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    prev_since = since - timedelta(days=days)
    weekly: list[dict] = []
    previous: list[dict] = []
    for content in recent:
        published_raw = content.get("publish_time")
        if not published_raw:
            continue
        published = datetime.fromisoformat(published_raw)
        if published >= since:
            weekly.append(content)
        elif published >= prev_since:
            previous.append(content)

    weekly_views = _sum_views(reg, weekly)
    previous_views = _sum_views(reg, previous)

    merged = build_account_strategy_graph(reg, gateway).invoke({"account_id": account_id})

    count = len(weekly)
    return {
        "account_id": account_id,
        "nickname": profile.get("nickname") or account_id,
        "platform": profile.get("platform"),
        "week_start": since.date().isoformat(),
        "week_end": now.date().isoformat(),
        "content_count": count,
        "total_views": str(weekly_views),
        "avg_views": str(int(weekly_views / count)) if count else "0",
        # 环比：与上一个等长周期对比
        "previous_content_count": len(previous),
        "previous_total_views": str(previous_views),
        "content_count_change_pct": _change_pct(Decimal(count), Decimal(len(previous))),
        "total_views_change_pct": _change_pct(weekly_views, previous_views),
        "health": merged["strategy"].account_health,
        "strategy_summary": merged["strategy"].strategy_summary,
    }


def render_weekly_report(summary: dict) -> str:
    """确定性渲染周报 markdown。"""
    lines = [
        f"# 运营周报：{summary['nickname']}",
        "",
        f"- 周期：{summary['week_start']} ~ {summary['week_end']}",
        f"- 平台：{summary['platform'] or '未知'}",
        "",
        "## 本周概况",
        f"- 发布内容：{summary['content_count']} 条",
        f"- 累计播放量：{summary['total_views']}",
        f"- 平均播放量：{summary['avg_views']}",
        "",
        "## 环比（对比上一个等长周期）",
        f"- 发布内容：{_format_pct(summary.get('content_count_change_pct'))}"
        f"（上期 {summary.get('previous_content_count', 0)} 条）",
        f"- 累计播放量：{_format_pct(summary.get('total_views_change_pct'))}"
        f"（上期 {summary.get('previous_total_views', '0')}）",
        "",
        f"## 账号健康度：{summary['health']}/100",
        "",
        "## 运营建议",
        f"- {summary['strategy_summary']}",
    ]
    return "\n".join(lines)


def generate_all_weekly_reports(
    database: Database,
    memory_store: SQLAlchemyMemoryStore | None,
    report_dir: str | None = None,
    days: int = 7,
    gateway: LLMGateway | None = None,
    notifiers: NotifierRegistry | None = None,
) -> list[str]:
    """为全部账号生成周报并写入报告目录，返回写入文件路径列表。

    report_dir 为 None 时回落到 Settings.report_dir（SMA_REPORT_DIR）——
    必须与 GET /api/v1/reports 读取的目录一致，否则周报写了却读不到。
    """
    target_dir = Path(report_dir or get_settings().report_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    with database.session() as session:
        accounts = AccountRepository(session).list(limit=1000)
        account_ids = [a.canonical_id for a in accounts]

    written: list[str] = []
    for account_id in account_ids:
        summary = build_weekly_report(database, memory_store, account_id, days, gateway)
        filename = f"weekly_{account_id.replace(':', '_')}_{summary['week_end']}.md"
        content = render_weekly_report(summary)
        path = target_dir / filename
        path.write_text(content, encoding="utf-8")
        written.append(str(path))
        # 投递是可选的旁路：失败不回滚已落盘的周报（见 services/notifier.py 的设计约束）
        if notifiers:
            results = notifiers.send_all(title=filename, markdown=content)
            logger.info("周报投递 file=%s channels=%s", filename, results)
    return written
