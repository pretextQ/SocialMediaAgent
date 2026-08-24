"""ToolRegistry：注册 / 查询 / 调用内部 Tool。"""

from __future__ import annotations

from typing import Any

from .base import Tool


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool:
        return self._tools[name]

    def list(self) -> list[Tool]:
        return list(self._tools.values())

    def invoke(self, name: str, **kwargs: Any) -> Any:
        return self.get(name).invoke(**kwargs)
