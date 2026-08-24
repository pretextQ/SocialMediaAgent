"""Agent 公共基座（P4-0）。

各 Agent / 内部能力与 API、MCP、Service 复用的助手：
- invoke_tool：经 ToolRegistry 调用内部 Tool
- build_facts_prompt：DB 事实 → LLM user 内容（约束只引用注入事实）
- llm_analyze：LLM 结构化输出；gateway 未配置或调用/校验失败 → 规则兜底
- render_markdown：通用报告渲染（标题 + 可选概览行 + 若干分节）
"""

from __future__ import annotations

from typing import Any, Callable, Type

from pydantic import BaseModel

from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.llm.gateway import LLMGateway


def invoke_tool(registry: ToolRegistry, name: str, **kwargs: Any) -> Any:
    return registry.get(name).invoke(**kwargs)


def build_facts_prompt(facts: dict) -> str:
    """将 DB 事实序列化为给 LLM 的 user 内容。"""
    return f"facts 数据如下（全部来自数据库，真实可靠，仅供分析引用，不得编造）：\n{facts}"


def llm_analyze(
    gateway: LLMGateway | None,
    system_prompt: str,
    facts: dict,
    response_model: Type[BaseModel],
    fallback: Callable[[dict], BaseModel],
) -> BaseModel:
    """LLM 结构化输出；gateway 未配置或调用/校验失败时走规则兜底。"""
    if gateway is None:
        return fallback(facts)
    result = gateway.call(
        system_prompt,
        build_facts_prompt(facts),
        response_format="json",
        response_model=response_model,
    )
    if result.success and isinstance(result.data, response_model):
        return result.data
    return fallback(facts)


def render_markdown(
    title: str,
    sections: list[tuple[str, list[str]]] | None = None,
    intro: list[str] | None = None,
) -> str:
    """通用报告渲染：标题 + 可选概览行 + (小标题, 条目列表) 分节。"""
    lines = [f"# {title}", ""]
    if intro:
        lines.extend(intro)
        lines.append("")
    for heading, items in sections or []:
        lines.append(f"## {heading}")
        lines.extend(f"- {item}" for item in items)
        if not items:
            lines.append("- （无）")
        lines.append("")
    return "\n".join(lines)
