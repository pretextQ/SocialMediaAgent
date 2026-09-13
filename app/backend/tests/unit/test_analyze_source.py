"""llm_analyze 来源标注单元测试（source: llm | rules）。

覆盖新增的 llm_analyze_with_source：
- gateway 未配置 → rules
- LLM 返回合法 JSON 且通过 pydantic 校验 → llm
- LLM 返回非法 JSON（校验失败） → rules
并回归 llm_analyze 的既有签名/返回值（仍返回模型本身，不是元组）。
"""

from pydantic import BaseModel

from socialmedia_agent.agents.common import llm_analyze, llm_analyze_with_source
from socialmedia_agent.llm.circuit_breaker import CircuitBreaker
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.llm.providers import LLMProvider


class Out(BaseModel):
    ok: bool


class ScriptedProvider(LLMProvider):
    def __init__(self, script: list[str]) -> None:
        self.script = script

    def complete(self, messages: list[dict], response_format: str = "text") -> str:
        return self.script.pop(0)


def _gateway(script: list[str]) -> LLMGateway:
    return LLMGateway(
        provider=ScriptedProvider(script),
        breaker=CircuitBreaker(name="src", failure_threshold=3, recovery_timeout=60),
    )


def _fallback(facts: dict) -> Out:
    return Out(ok=False)


def test_source_is_rules_without_gateway():
    model, source = llm_analyze_with_source(None, "sys", {}, Out, _fallback)
    assert source == "rules"
    assert model.ok is False


def test_source_is_llm_on_valid_model_output():
    model, source = llm_analyze_with_source(
        _gateway(['{"ok": true}']), "sys", {}, Out, _fallback
    )
    assert source == "llm"
    assert model.ok is True


def test_source_is_rules_on_invalid_output():
    """非法 JSON → gateway 调用不成功 → 规则兜底，来源必须诚实标 rules。"""
    model, source = llm_analyze_with_source(
        _gateway(["not-json"]), "sys", {}, Out, _fallback
    )
    assert source == "rules"
    assert model.ok is False


def test_source_is_rules_when_schema_validation_fails():
    """JSON 合法但不符合契约 → pydantic 校验失败 → 规则兜底。"""
    model, source = llm_analyze_with_source(
        _gateway(['{"ok": "not-a-bool"}']), "sys", {}, Out, _fallback
    )
    assert source == "rules"
    assert model.ok is False


def test_llm_analyze_still_returns_model_only():
    """既有签名与返回值不变：直接返回模型实例，不是 (model, source) 元组。"""
    result = llm_analyze(None, "sys", {}, Out, lambda facts: Out(ok=True))
    assert isinstance(result, Out)
    assert result.ok is True
