"""定时调度测试（TDD，P5-2）。

验证：create_weekly_report_scheduler 注册每周一 9 点的周报任务。
"""

from socialmedia_agent.database.session import Database
from socialmedia_agent.memory.store import build_memory_store


def test_scheduler_registers_weekly_job(tmp_path):
    from socialmedia_agent.services.scheduler import create_weekly_report_scheduler

    db = Database(url=f"sqlite:///{tmp_path / 's.db'}")
    mem = build_memory_store(url=f"sqlite:///{tmp_path / 'smem.db'}")
    scheduler = create_weekly_report_scheduler(db, mem, str(tmp_path / "reports"))
    scheduler.start()
    try:
        jobs = scheduler.get_jobs()
        assert len(jobs) == 1
        job = jobs[0]
        assert job.id == "weekly_report"
        assert "mon" in str(job.trigger)
    finally:
        scheduler.shutdown(wait=False)
