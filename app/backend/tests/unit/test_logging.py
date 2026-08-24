"""基础日志测试（TDD，P5.5.5）。

覆盖：
- setup_logging 配置根日志
- LLM Gateway 失败日志不输出密钥 / 消息内容
- llm_analyze 兜底可见性（规则兜底/LLM 回退）
- Memory 只记元数据不记 content
- Connector runner 错误有日志
"""

import io
import logging
from contextlib import contextmanager

from socialmedia_agent.logging_config import setup_logging


@contextmanager
def capture_logger(name: str):
    logger = logging.getLogger(name)
    buf = io.StringIO()
    handler = logging.StreamHandler(buf)
    old_level = logger.level
    logger.addHandler(handler)
    logger.setLevel(logging.DEBUG)
    try:
        yield buf
    finally:
        logger.removeHandler(handler)
        logger.setLevel(old_level)


def test_setup_logging_configures_root():
    setup_logging(level=logging.INFO)
    root = logging.getLogger()
    assert any(isinstance(h, logging.StreamHandler) for h in root.handlers)


def test_llm_gateway_logs_failure_without_secrets():
    from socialmedia_agent.llm.circuit_breaker import CircuitBreaker
    from socialmedia_agent.llm.gateway import LLMGateway
    from socialmedia_agent.llm.providers import LLMProvider

    class BoomProvider(LLMProvider):
        def complete(self, messages: list[dict], response_format: str = "text") -> str:
            raise RuntimeError("boom sk-super-secret-key-12345")

    gateway = LLMGateway(
        provider=BoomProvider(),
        breaker=CircuitBreaker(name="t", failure_threshold=1, recovery_timeout=60),
    )
    with capture_logger("socialmedia_agent.llm.gateway") as buf:
        result = gateway.call("sys", "user-秘密内容", response_format="json")
    out = buf.getvalue()
    assert not result.success
    assert "LLM" in out  # 有失败日志
    assert "sk-super-secret" not in out  # 不输出密钥
    assert "user-秘密内容" not in out  # 不输出消息内容


def test_llm_analyze_fallback_visible():
    from socialmedia_agent.agents.common import llm_analyze
    from pydantic import BaseModel

    class Out(BaseModel):
        ok: bool

    with capture_logger("socialmedia_agent.agents.common") as buf:
        out = llm_analyze(None, "sys", {"a": 1}, Out, fallback=lambda f: Out(ok=True))
    assert "规则兜底" in buf.getvalue()
    assert out.ok


def test_memory_logs_metadata_not_content():
    from sqlalchemy.orm import sessionmaker

    from socialmedia_agent.database.engine import create_db_engine
    from socialmedia_agent.memory.models import MemoryEntry, MemoryCategory
    from socialmedia_agent.memory.store import SQLAlchemyMemoryStore

    engine = create_db_engine("sqlite:///:memory:")
    SQLAlchemyMemoryStore.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)()
    store = SQLAlchemyMemoryStore(session)

    with capture_logger("socialmedia_agent.memory.store") as buf:
        store.add(
            MemoryEntry(
                account_id="bilibili:90001",
                category=MemoryCategory.STRATEGY,
                content="每周五发布长视频（敏感内容）",
            )
        )
    out = buf.getvalue()
    assert "bilibili:90001" in out
    assert "strategy" in out
    assert "每周五发布长视频" not in out  # 不记录 content


def test_connector_runner_logs_error(tmp_path):
    from socialmedia_agent.connectors.mediacrawler.runner import MediaCrawlerRunner

    runner = MediaCrawlerRunner(crawler_dir=tmp_path / "missing", python_executable=tmp_path / "py.exe")
    with capture_logger("socialmedia_agent.connectors.mediacrawler.runner") as buf:
        try:
            runner.run_search("bili", "测试")
        except Exception:
            pass
    assert "不存在" in buf.getvalue()
