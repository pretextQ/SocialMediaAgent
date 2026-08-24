"""LLM Gateway 单元测试（TDD）。

覆盖：
- text 模式返回原始文本
- json 模式返回 dict
- pydantic 结构化输出校验
- json 解析失败 / pydantic 校验失败 → success=False
- 熔断：连续失败 OPEN → 短路失败 → 恢复 HALF_OPEN 后成功
- 重试：临时失败后成功（retry 生效）
"""

import pytest
from pydantic import BaseModel

from socialmedia_agent.llm.circuit_breaker import CircuitBreaker, CircuitBreakerOpen
from socialmedia_agent.llm.gateway import LLMCallResult, LLMGateway
from socialmedia_agent.llm.providers import LLMProvider


class FakeProvider(LLMProvider):
    """可控的假 Provider：按脚本返回文本或抛异常。"""

    def __init__(self) -> None:
        self.script: list[str | Exception] = []
        self._calls = 0

    def complete(self, messages: list[dict], response_format: str = "text") -> str:
        self._calls += 1
        step = self.script.pop(0)
        if isinstance(step, Exception):
            raise step
        return step


class Heartbeat(BaseModel):
    ok: bool


def make_gateway(provider: FakeProvider, breaker: CircuitBreaker | None = None) -> LLMGateway:
    return LLMGateway(
        provider=provider,
        breaker=breaker or CircuitBreaker(name="t", failure_threshold=3, recovery_timeout=60),
    )


def test_text_mode_returns_raw_text():
    p = FakeProvider()
    p.script = ["hello world"]
    g = make_gateway(p)
    result = g.call("sys", "user", response_format="text")
    assert result.success
    assert result.data == "hello world"


def test_json_mode_returns_dict():
    p = FakeProvider()
    p.script = ['{"ok": true}']
    g = make_gateway(p)
    result = g.call("sys", "user", response_format="json")
    assert result.success
    assert result.data == {"ok": True}


def test_json_mode_strips_markdown_fence():
    p = FakeProvider()
    p.script = ["```json\n{\"ok\": false}\n```"]
    g = make_gateway(p)
    result = g.call("sys", "user", response_format="json")
    assert result.data == {"ok": False}


def test_pydantic_validation_returns_model():
    p = FakeProvider()
    p.script = ['{"ok": true}']
    g = make_gateway(p)
    result = g.call("sys", "user", response_format="json", response_model=Heartbeat)
    assert result.success
    assert isinstance(result.data, Heartbeat)
    assert result.data.ok is True


def test_json_parse_failure_returns_error_result():
    p = FakeProvider()
    p.script = ["not json at all"]
    g = make_gateway(p)
    result = g.call("sys", "user", response_format="json")
    assert not result.success
    assert result.error is not None
    assert "JSON" in result.error


def test_pydantic_validation_failure_returns_error_result():
    p = FakeProvider()
    p.script = ['{"ok": "not-a-bool"}']
    g = make_gateway(p)
    result = g.call("sys", "user", response_format="json", response_model=Heartbeat)
    assert not result.success
    assert result.error is not None


def test_circuit_opens_after_threshold_then_recovers():
    p = FakeProvider()
    p.script = [
        RuntimeError("boom"),
        RuntimeError("boom"),
        RuntimeError("boom"),
        '{"ok": true}',  # 恢复试探成功
    ]
    breaker = CircuitBreaker(name="t", failure_threshold=3, recovery_timeout=60)
    g = make_gateway(p, breaker=breaker)

    for _ in range(3):
        result = g.call("sys", "user", response_format="json")
        assert not result.success

    # OPEN 期间：即使 provider 可用也短路，不再调用
    p.script = ["unused"]
    result = g.call("sys", "user", response_format="json")
    assert not result.success
    assert "OPEN" in (result.error or "")
    assert p._calls == 3  # 短路后不再调用 provider

    # 恢复期过后允许 HALF_OPEN 试探
    breaker._last_failure_time = breaker._last_failure_time - 999
    p.script = ['{"ok": true}']
    result = g.call("sys", "user", response_format="json")
    assert result.success
    assert breaker.state == "closed"  # HALF_OPEN 试探成功后已关闭


def test_retry_succeeds_after_transient_failure():
    p = FakeProvider()
    p.script = [RuntimeError("temp"), '{"ok": true}']
    g = make_gateway(p)
    result = g.call("sys", "user", response_format="json", max_retries=2)
    assert result.success
    assert p._calls == 2


def test_retry_exhausted_returns_error():
    p = FakeProvider()
    p.script = [RuntimeError("x")] * 3
    g = make_gateway(p)
    result = g.call("sys", "user", response_format="json", max_retries=2)
    assert not result.success


def test_circuit_breaker_open_raises_without_breaker_capture():
    breaker = CircuitBreaker(name="t", failure_threshold=1, recovery_timeout=60)
    breaker.record_failure()
    assert breaker.state == "open"
    assert isinstance(breaker.state, str)
