"""以子进程方式调度 MediaCrawler（隔离 venv）。

架构约束：MediaCrawler 保持隔离；其中转 SQLite 仅为临时中转，
核心库是 SocialMediaAgent 自己的数据库。
"""

from __future__ import annotations

import logging
import subprocess
from pathlib import Path

from socialmedia_agent.config import get_settings

logger = logging.getLogger(__name__)


def _backend_dir() -> Path:
    # .../app/backend/src/socialmedia_agent/connectors/mediacrawler/runner.py
    # parents[4] = app/backend
    return Path(__file__).resolve().parents[4]


def _project_root() -> Path:
    # app/backend -> app -> 项目根
    return _backend_dir().parent.parent


# 默认路径（由配置层 / .env 管理，避免写死）
CRAWLER_DIR = Path(get_settings().crawler_dir)
CRAWLER_PYTHON = Path(get_settings().crawler_python)
STAGING_DB_PATH = Path(get_settings().crawler_db)


class MediaCrawlerRunError(RuntimeError):
    """MediaCrawler 子进程执行失败。"""


class MediaCrawlerRunner:
    def __init__(
        self,
        crawler_dir: str | Path | None = None,
        python_executable: str | Path | None = None,
        timeout: int = 600,
    ):
        self.crawler_dir = Path(crawler_dir or CRAWLER_DIR)
        self.python = Path(python_executable or CRAWLER_PYTHON)
        self.timeout = timeout

    def run_search(self, platform_code: str, keywords: str, max_count: int = 3) -> None:
        if not self.crawler_dir.exists():
            logger.error("MediaCrawler 目录不存在: %s", self.crawler_dir)
            raise MediaCrawlerRunError(f"MediaCrawler 目录不存在: {self.crawler_dir}")
        if not self.python.exists():
            logger.error("MediaCrawler 解释器不存在: %s", self.python)
            raise MediaCrawlerRunError(f"MediaCrawler 解释器不存在: {self.python}（请先安装隔离 venv）")

        cmd = [
            str(self.python),
            "main.py",
            "--platform",
            platform_code,
            "--type",
            "search",
            "--keywords",
            keywords,
            "--save_data_option",
            "sqlite",
            "--headless",
            "no",
            "--max_concurrency_num",
            "1",
            "--max_comments_count_singlenotes",
            "0",
        ]
        logger.info("MediaCrawler 采集开始 platform=%s keywords=%s limit=%s", platform_code, keywords, max_count)
        try:
            result = subprocess.run(
                cmd,
                cwd=str(self.crawler_dir),
                capture_output=True,
                text=True,
                timeout=self.timeout,
            )
        except subprocess.TimeoutExpired as exc:
            logger.error("MediaCrawler 采集超时（>%ss）", self.timeout)
            raise MediaCrawlerRunError(f"MediaCrawler 采集超时（>{self.timeout}s）") from exc

        if result.returncode != 0:
            tail = "\n".join((result.stderr or "").strip().splitlines()[-20:])
            logger.error("MediaCrawler 执行失败 code=%s", result.returncode)
            raise MediaCrawlerRunError(f"MediaCrawler 执行失败 (code={result.returncode})\n{tail}")
        logger.info("MediaCrawler 采集完成 platform=%s", platform_code)
