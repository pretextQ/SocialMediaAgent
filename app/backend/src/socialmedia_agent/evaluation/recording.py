"""记录型 ToolRegistry（M3）。

评测需要知道**实际**调了哪些工具，而不是靠手写常量去猜——
常量会和实现悄悄脱节，记录不会。
"""

from __future__ import annotations

from typing import Any

from socialmedia_agent.agents.tools.base import Tool
from socialmedia_agent.agents.tools.registry import ToolRegistry


class _RecordingTool:
    """代理一个 Tool，在 invoke 前记录其名字。"""

    def __init__(self, inner: Tool, calls: list[str]):
        self._inner = inner
        self._calls = calls
        self.name = inner.name
        self.description = inner.description
        self.args_schema = inner.args_schema

    def invoke(self, **kwargs: Any) -> Any:
        self._calls.append(self._inner.name)
        return self._inner.invoke(**kwargs)


class RecordingRegistry(ToolRegistry):
    """包装已有 registry，记录每个被调用的工具名（保持注册内容不变）。"""

    def __init__(self, inner: ToolRegistry):
        super().__init__()
        self._inner = inner
        self.calls: list[str] = []

    def get(self, name: str) -> Tool:
        return _RecordingTool(self._inner.get(name), self.calls)  # type: ignore[return-value]

    def list(self) -> list[Tool]:
        return self._inner.list()
