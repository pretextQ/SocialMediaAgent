"""定时调度（P5-2）：APScheduler 每周一 9 点生成全部账号周报。"""

from __future__ import annotations

from apscheduler.schedulers.background import BackgroundScheduler

from socialmedia_agent.database.session import Database
from socialmedia_agent.memory.store import SQLAlchemyMemoryStore
from socialmedia_agent.services.weekly_report import generate_all_weekly_reports


def create_weekly_report_scheduler(
    database: Database,
    memory_store: SQLAlchemyMemoryStore | None,
    report_dir: str,
) -> BackgroundScheduler:
    """构造后台调度器：每周一 09:00 触发周报生成。"""
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
        },
        id="weekly_report",
        replace_existing=True,
    )
    return scheduler
