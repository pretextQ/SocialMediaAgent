"""定时调度（P5-2）：APScheduler 每周一 9 点生成全部账号周报。"""

from __future__ import annotations

from apscheduler.schedulers.background import BackgroundScheduler

from socialmedia_agent.database.session import Database
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.memory.store import SQLAlchemyMemoryStore
from socialmedia_agent.services.weekly_report import generate_all_weekly_reports


def create_weekly_report_scheduler(
    database: Database,
    memory_store: SQLAlchemyMemoryStore | None,
    report_dir: str | None = None,
    gateway: LLMGateway | None = None,
) -> BackgroundScheduler:
    """构造后台调度器：每周一 09:00 触发周报生成。

    report_dir 省略时由 generate_all_weekly_reports 回落到 Settings.report_dir，
    与 GET /api/v1/reports 读取的目录保持一致。
    """
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        generate_all_weekly_reports,
        trigger="cron",
        day_of_week="mon",
        hour=9,
        minute=0,
        kwargs={
            "database": database,
            "memory_store": memory_store,
            "report_dir": report_dir,
            "gateway": gateway,
        },
        id="weekly_report",
        replace_existing=True,
    )
    return scheduler
