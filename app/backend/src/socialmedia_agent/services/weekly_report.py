"""周报服务（P5-2）。

build_weekly_report：聚合账号近 N 天表现（内容数/播放量，按 publish_time 过滤）
                     + 复用诊断/策略 Agent（健康度 + 策略摘要）→ 结构化摘要
render_weekly_report：确定性渲染 markdown
generate_all_weekly_reports：为全部账号生成并落盘
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

from socialmedia_agent.agents.account_strategy.graph import build_account_strategy_graph
from socialmedia_agent.agents.tools.catalog import build_registry
from socialmedia_agent.database.session import Database
from socialmedia_agent.memory.store import SQLAlchemyMemoryStore
from socialmedia_agent.memory.summarizer import Summarizer
from socialmedia_agent.repositories.account_repo import AccountRepository


def _registry(database: Database, memory_store: SQLAlchemyMemoryStore | None) -> ToolRegistry:
    return build_registry(
        database,
        memory_store=memory_store,
        summarizer=Summarizer() if memory_store else None,
    )


def build_weekly_report(
    database: Database,
    memory_store: SQLAlchemyMemoryStore | None,
    account_id: str,
    days: int = 7,
) -> dict:
    """聚合账号近 days 天表现并复用诊断/策略 Agent，返回结构化周报摘要。"""
    reg = _registry(database, memory_store)
    profile = reg.invoke("get_account_profile", account_id=account_id) or {}
    recent = reg.invoke("get_recent_contents", account_id=account_id, limit=50)

    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    weekly: list[dict] = []
    for c in recent:
        pub = c.get("publish_time")
        if not pub:
            continue
        if datetime.fromisoformat(pub) >= since:
            weekly.append(c)

    weekly_views = Decimal("0")
    for c in weekly:
        for m in reg.invoke("get_content_metrics", content_id=c["canonical_id"]):
            if m.get("metric_type") == "views":
                weekly_views += Decimal(m.get("value", "0"))

    merged = build_account_strategy_graph(reg, None).invoke({"account_id": account_id})

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
        f"## 账号健康度：{summary['health']}/100",
        "",
        "## 运营建议",
        f"- {summary['strategy_summary']}",
    ]
    return "\n".join(lines)


def generate_all_weekly_reports(
    database: Database,
    memory_store: SQLAlchemyMemoryStore | None,
    report_dir: str,
    days: int = 7,
) -> list[str]:
    """为全部账号生成周报并写入 report_dir，返回写入文件路径列表。"""
    Path(report_dir).mkdir(parents=True, exist_ok=True)
    with database.session() as session:
        accounts = AccountRepository(session).list(limit=1000)
        account_ids = [a.canonical_id for a in accounts]

    written: list[str] = []
    for account_id in account_ids:
        summary = build_weekly_report(database, memory_store, account_id, days)
        filename = f"weekly_{account_id.replace(':', '_')}_{summary['week_end']}.md"
        path = Path(report_dir) / filename
        path.write_text(render_weekly_report(summary), encoding="utf-8")
        written.append(str(path))
    return written
