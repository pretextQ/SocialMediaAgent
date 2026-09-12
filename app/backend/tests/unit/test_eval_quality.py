"""输出质量评委测试（TDD，P6）。

评委本身是 LLM，因此**它的分数不是 ground truth**：只能作相对信号（回归/对比），
不能当绝对质量结论。这里验证解析与失败处理，不验证「分数准不准」。
"""

import json

import pytest

from socialmedia_agent.evaluation.quality import judge_quality
from socialmedia_agent.llm.circuit_breaker import CircuitBreaker
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.llm.providers import LLMProvider

JUDGE_PAYLOAD = {
    "specificity": 80,
    "structure": 70,
    "conciseness": 60,
    "overall": 72,
    "rationale": "具体但略显冗长",
}


class CannedProvider(LLMProvider):
    def __init__(self, payload: str):
        self.payload = payload
        self.calls = 0

    def complete(self, messages, response_format: str = "text") -> str:
        self.calls += 1
        return self.payload


def make_gateway(payload: str) -> LLMGateway:
    return LLMGateway(
        provider=CannedProvider(payload),
        breaker=CircuitBreaker(name="judge", failure_threshold=99, recovery_timeout=60),
    )


def test_judge_parses_structured_scores():
    gateway = make_gateway(json.dumps(JUDGE_PAYLOAD, ensure_ascii=False))

    judgement = judge_quality(gateway, "## 报告\n- 内容", {"account_id": "x"})

    assert judgement is not None
    assert judgement.overall == 72
    assert judgement.specificity == 80
    assert judgement.rationale == "具体但略显冗长"


def test_judge_returns_none_on_unparseable_output():
    gateway = make_gateway("这不是 JSON")

    assert judge_quality(gateway, "## 报告", {}) is None


def test_judge_returns_none_on_out_of_range_scores():
    bad = dict(JUDGE_PAYLOAD, overall=150)
    gateway = make_gateway(json.dumps(bad, ensure_ascii=False))

    assert judge_quality(gateway, "## 报告", {}) is None


def test_judge_requires_gateway():
    with pytest.raises(ValueError, match="gateway"):
        judge_quality(None, "## 报告", {})
