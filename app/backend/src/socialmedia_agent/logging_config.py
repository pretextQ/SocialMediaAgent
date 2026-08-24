"""基础日志配置（P5.5.5）。

- setup_logging：进程入口（CLI / MCP）调用，统一格式。
- 安全红线：任何日志不得输出 API Key / Token / LLM 消息内容 / 用户敏感信息。
  各模块只记录元数据（format / category / account_id / 计数等），不记录载荷内容。
  FastAPI 由 uvicorn 接管根日志，无需调用 setup_logging。
"""

from __future__ import annotations

import logging

_FORMAT = "%(asctime)s %(levelname)s %(name)s: %(message)s"


def setup_logging(level: int = logging.INFO) -> None:
    """配置根日志（进程级入口调用；幂等）。"""
    logging.basicConfig(level=level, format=_FORMAT, force=True)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
