"""Agent 公共基座（P4-0）。

各 Agent / 内部能力与 API、MCP、Service 复用的助手：
- invoke_tool：经 ToolRegistry 调用内部 Tool
- build_facts_prompt：DB 事实 → LLM user 内容（约束只引用注入事实）
- llm_analyze：LLM 结构化输出；gateway 未配置或调用/校验失败 → 规则兜底
- llm_analyze_with_source：同上，额外返回本次结果的**实际来源**（llm / rules），
  供 API 响应体标注「AI 生成」还是「规则兜底」（见 docs/plan-frontend.md 第五节）
- render_markdown：通用报告渲染（标题 + 可选概览行 + 若干分节）
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Literal, Type

from pydantic import BaseModel

from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.llm.gateway import LLMGateway

logger = logging.getLogger(__name__)


def invoke_tool(registry: ToolRegistry, name: str, **kwargs: Any) -> Any:
    return registry.get(name).invoke(**kwargs)


def build_facts_prompt(facts: dict) -> str:
    """将 DB 事实序列化为给 LLM 的 user 内容。"""
    return f"facts 数据如下（全部来自数据库，真实可靠，仅供分析引用，不得编造）：\n{facts}"


# 本次结构化结果的来源：llm = 确实由模型产出；rules = 规则兜底
AnalyzeSource = Literal["llm", "rules"]


def llm_analyze_with_source(
    gateway: LLMGateway | None,
    system_prompt: str,
    facts: dict,
    response_model: Type[BaseModel],
    fallback: Callable[[dict], BaseModel],
) -> tuple[BaseModel, AnalyzeSource]:
    """LLM 结构化输出，并返回**实际来源**。

    来源语义（与 API 响应体的 source 字段一致）：

    - `"llm"`：本次结果确实由 LLM 结构化输出并通过 pydantic 校验；
    - `"rules"`：gateway 未配置、调用失败、JSON 解析失败或校验失败，走了规则兜底。

    注意与 account_strategy 的 `gather_source` 区分：那个描述**取数阶段**由谁决策，
    本字段描述**分析阶段**的结果由谁产出，两者可共存。
    """
    model_name = response_model.__name__
    if gateway is None:
        logger.info("llm_analyze: gateway 未配置，走规则兜底 model=%s", model_name)
        return fallback(facts), "rules"
    result = gateway.call(
        system_prompt,
        build_facts_prompt(facts),
        response_format="json",
        response_model=response_model,
    )
    if result.success and isinstance(result.data, response_model):
        logger.debug("llm_analyze: LLM 结构化输出成功 model=%s", model_name)
        return result.data, "llm"
    logger.warning("llm_analyze: LLM 输出无效，回退规则兜底 model=%s", model_name)
    return fallback(facts), "rules"


def llm_analyze(
    gateway: LLMGateway | None,
    system_prompt: str,
    facts: dict,
    response_model: Type[BaseModel],
    fallback: Callable[[dict], BaseModel],
) -> BaseModel:
    """LLM 结构化输出；gateway 未配置或调用/校验失败时走规则兜底。

    签名与返回值保持不变（既有调用方依赖）；需要来源标注请用
    `llm_analyze_with_source`。
    """
    model, _source = llm_analyze_with_source(
        gateway, system_prompt, facts, response_model, fallback
    )
    return model


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
