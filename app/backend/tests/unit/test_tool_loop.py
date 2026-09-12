"""Tool Calling 循环测试（TDD，M2）。

覆盖：
- export_tool_schemas：内部 Tool -> OpenAI function-calling schema
- 单轮工具调用：执行 -> 结果回灌 -> 模型给出最终回答
- 多轮：按顺序调用多个工具
- 观测结果以 role=tool 回灌给模型
- allowed_tools 白名单
- 超过 max_steps => 失败（供上层回退）
- 工具执行异常 => 记录错误、回灌、循环继续
- 模型请求不存在的工具 => 记录错误、不崩
- gateway 调用失败 => ok=False
"""

from pydantic import BaseModel

from socialmedia_agent.agents.tool_loop import (
    ToolLoopResult,
    export_tool_schemas,
    run_tool_loop,
)
from socialmedia_agent.agents.tools.base import Tool
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.llm.circuit_breaker import CircuitBreaker
from socialmedia_agent.llm.gateway import LLMGateway
from socialmedia_agent.llm.providers import (
    ProviderToolCall,
    ProviderToolResult,
    ToolCallingProvider,
)


class AccountIdArgs(BaseModel):
    account_id: str


class RecentArgs(BaseModel):
    account_id: str
    limit: int = 10


def _profile(account_id: str) -> dict:
    return {"canonical_id": account_id, "nickname": "示例账号"}


def _recent(account_id: str, limit: int = 10) -> list[dict]:
    return [{"canonical_id": f"{account_id}#{i}"} for i in range(limit)]


def _boom(account_id: str) -> dict:
    raise RuntimeError("工具炸了")


def make_registry() -> ToolRegistry:
    registry = ToolRegistry()
    registry.register(Tool("get_account_profile", "获取账号资料", AccountIdArgs, _profile))
    registry.register(Tool("get_recent_contents", "获取最近内容", RecentArgs, _recent))
    registry.register(Tool("explode_tool", "会抛异常的工具", AccountIdArgs, _boom))
    return registry


class ScriptedToolProvider(ToolCallingProvider):
    """按脚本返回工具调用/最终文本，并记录每次收到的 messages 与 tools。"""

    def __init__(self, script):
        self.script = list(script)
        self.calls: list[dict] = []

    def complete(self, messages, response_format="text"):  # pragma: no cover
        raise AssertionError("tool loop 不应走文本路径")

    def complete_with_tools(self, messages, tools):
        self.calls.append({"messages": [dict(m) for m in messages], "tools": list(tools)})
        step = self.script.pop(0)
        if isinstance(step, Exception):
            raise step
        return step


def make_gateway(provider) -> LLMGateway:
    return LLMGateway(
        provider=provider,
        breaker=CircuitBreaker(name="t", failure_threshold=5, recovery_timeout=60),
    )


def call(name, **args):
    return ProviderToolResult(
        tool_calls=[ProviderToolCall(id=f"call-{name}", name=name, arguments=args)]
    )


def final(text):
    return ProviderToolResult(content=text, tool_calls=[])


def test_export_tool_schemas_uses_openai_function_format():
    schemas = export_tool_schemas(make_registry().list())

    by_name = {s["function"]["name"]: s for s in schemas}
    assert set(by_name) == {"get_account_profile", "get_recent_contents", "explode_tool"}

    profile = by_name["get_account_profile"]
    assert profile["type"] == "function"
    assert profile["function"]["description"] == "获取账号资料"
    params = profile["function"]["parameters"]
    assert params["type"] == "object"
    assert "account_id" in params["properties"]
    assert params["required"] == ["account_id"]


def test_tool_loop_executes_tool_then_returns_final_message():
    provider = ScriptedToolProvider([
        call("get_account_profile", account_id="bilibili:1"),
        final("分析完成"),
    ])
    result = run_tool_loop(
        make_registry(), make_gateway(provider), system_prompt="sys", user_prompt="usr"
    )

    assert isinstance(result, ToolLoopResult)
    assert result.ok
    assert result.final_message == "分析完成"
    assert [r.name for r in result.tool_calls] == ["get_account_profile"]
    assert result.tool_calls[0].ok
    assert result.tool_calls[0].result == {"canonical_id": "bilibili:1", "nickname": "示例账号"}
    assert result.steps == 2


def test_tool_loop_executes_multiple_tools_in_order():
    provider = ScriptedToolProvider([
        call("get_account_profile", account_id="bilibili:1"),
        call("get_recent_contents", account_id="bilibili:1", limit=3),
        final("done"),
    ])
    result = run_tool_loop(
        make_registry(), make_gateway(provider), system_prompt="s", user_prompt="u"
    )

    assert [r.name for r in result.tool_calls] == ["get_account_profile", "get_recent_contents"]
    assert len(result.tool_calls[1].result) == 3
    assert result.steps == 3


def test_tool_loop_feeds_observations_back_to_model():
    provider = ScriptedToolProvider([
        call("get_account_profile", account_id="bilibili:1"),
        final("done"),
    ])
    run_tool_loop(make_registry(), make_gateway(provider), system_prompt="s", user_prompt="u")

    second_messages = provider.calls[1]["messages"]
    tool_messages = [m for m in second_messages if m.get("role") == "tool"]
    assert len(tool_messages) == 1
    assert "示例账号" in tool_messages[0]["content"]


def test_tool_loop_respects_allowed_tools():
    provider = ScriptedToolProvider([final("done")])
    run_tool_loop(
        make_registry(), make_gateway(provider), system_prompt="s", user_prompt="u",
        allowed_tools=["get_account_profile"],
    )

    exposed = [t["function"]["name"] for t in provider.calls[0]["tools"]]
    assert exposed == ["get_account_profile"]


def test_tool_loop_fails_when_max_steps_exceeded():
    provider = ScriptedToolProvider([call("get_account_profile", account_id="a")] * 5)
    result = run_tool_loop(
        make_registry(), make_gateway(provider), system_prompt="s", user_prompt="u", max_steps=2
    )

    assert not result.ok
    assert result.error is not None and "步数" in result.error
    assert len(result.tool_calls) == 2
    assert result.steps == 2


def test_tool_loop_records_tool_error_and_continues():
    provider = ScriptedToolProvider([
        call("explode_tool", account_id="a"),
        final("我换了个思路"),
    ])
    result = run_tool_loop(
        make_registry(), make_gateway(provider), system_prompt="s", user_prompt="u"
    )

    assert result.ok
    assert [r.name for r in result.tool_calls] == ["explode_tool"]
    assert result.tool_calls[0].ok is False
    assert "工具炸了" in (result.tool_calls[0].error or "")

    tool_messages = [m for m in provider.calls[1]["messages"] if m.get("role") == "tool"]
    assert "工具炸了" in tool_messages[0]["content"]


def test_tool_loop_handles_unknown_tool_without_crashing():
    provider = ScriptedToolProvider([
        call("no_such_tool", account_id="a"),
        final("done"),
    ])
    result = run_tool_loop(
        make_registry(), make_gateway(provider), system_prompt="s", user_prompt="u"
    )

    assert result.ok
    assert result.tool_calls[0].ok is False
    assert "no_such_tool" in (result.tool_calls[0].error or "")


def test_tool_loop_returns_failure_when_gateway_fails():
    provider = ScriptedToolProvider([RuntimeError("boom")] * 5)
    result = run_tool_loop(
        make_registry(), make_gateway(provider), system_prompt="s", user_prompt="u"
    )

    assert not result.ok
    assert result.error
