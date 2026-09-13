"""get_gateway 依赖解析的单元测试。

语义：
- 注入 gateway_factory 时按角色解析（per-Agent 模型）；
- 未注入时回落 app.state.gateway（既有测试只注入一个 gateway，行为不能变）；
- 两者都没有时返回 None（调用方走规则兜底）。
"""

from __future__ import annotations

from types import SimpleNamespace

from socialmedia_agent.api.deps import get_gateway


def _request(**state) -> SimpleNamespace:
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(**state)))


def test_prefers_gateway_factory_when_injected():
    seen: list[str | None] = []
    request = _request(
        gateway="default-gateway",
        gateway_factory=lambda role: (seen.append(role), "role-gateway")[1],
    )
    assert get_gateway(request, "content_analysis") == "role-gateway"
    assert seen == ["content_analysis"]


def test_factory_receives_none_when_no_role_given():
    seen: list[str | None] = []
    request = _request(
        gateway="default-gateway",
        gateway_factory=lambda role: (seen.append(role), "role-gateway")[1],
    )
    assert get_gateway(request) == "role-gateway"
    assert seen == [None]


def test_falls_back_to_app_state_gateway_without_factory():
    sentinel = object()
    request = _request(gateway=sentinel)
    assert get_gateway(request, "trend_analysis") is sentinel


def test_returns_none_when_nothing_injected():
    assert get_gateway(_request(), "trend_analysis") is None
