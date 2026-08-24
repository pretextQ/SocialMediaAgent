"""Title Optimization 内部能力（P5.5.1，不再作为独立 Agent）。

gather：content_id 模式取内容标题 + 指标；原始标题模式直接用传入标题；都取标题写作知识
analyze：LLM 结构化输出（固定 3 条）；失败或未配置 gateway 时规则兜底（确定性模板）
render_report：由结构化结果规则渲染人类可读 markdown

供 API / MCP 直接调用（不再经 LangGraph 图）。
"""

from __future__ import annotations

from socialmedia_agent.agents.common import invoke_tool, llm_analyze, render_markdown
from socialmedia_agent.agents.title_optimization.prompts import SYSTEM_PROMPT
from socialmedia_agent.agents.title_optimization.schemas import TitleOptimizationOutput
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.llm.gateway import LLMGateway


def gather(
    registry: ToolRegistry,
    content_id: str | None = None,
    title: str | None = None,
) -> dict:
    """收集标题优化所需事实（只经 Tool）。"""
    original = title
    metrics: list[dict] = []
    if content_id:
        details = invoke_tool(registry, "get_content_details", content_id=content_id) or {}
        original = details.get("title") or title or content_id
        metrics = invoke_tool(registry, "get_content_metrics", content_id=content_id)
    knowledge = invoke_tool(registry, "search_operation_knowledge", query="标题写作方法", top_k=3)
    return {
        "content_id": content_id,
        "original": original,
        "metrics": metrics,
        "knowledge": knowledge,
    }


def analyze(gateway: LLMGateway | None, facts: dict) -> TitleOptimizationOutput:
    """LLM 结构化输出（固定 3 条）；失败或未配置 gateway 时规则兜底。"""
    return llm_analyze(
        gateway, SYSTEM_PROMPT, facts, TitleOptimizationOutput, fallback=_rule_fallback
    )


def _rule_templates(original: str) -> list[str]:
    """确定性模板：数字 + 情绪词 + 悬念钩子（对齐标题写作知识）。"""
    return [
        f"{original}｜看完秒懂",
        f"{original}（3 个实用技巧）",
        f"别再错过：{original}",
    ]


def _rule_fallback(facts: dict) -> TitleOptimizationOutput:
    """确定性规则兜底：固定 3 条模板标题。"""
    original = facts.get("original", "")
    views = ""
    for m in facts.get("metrics") or []:
        if m.get("metric_type") == "views":
            views = m.get("value", "")
            break
    perf = f"，参考该内容历史播放量 {views}" if views else ""
    return TitleOptimizationOutput(
        original=original,
        optimized_titles=_rule_templates(original),
        explanation=f"规则兜底：结合标题写作知识（数字 + 情绪词 + 悬念钩子）{perf} 生成 3 个变体",
    )


def render_report(out: TitleOptimizationOutput, facts: dict) -> str:
    """由结构化结果渲染人类可读 markdown（确定性）。"""
    items = [f"{i + 1}. {t}" for i, t in enumerate(out.optimized_titles)]
    sections = [
        ("优化标题", items),
        ("说明", [out.explanation]),
    ]
    return render_markdown(
        title=f"标题优化：{out.original}",
        sections=sections,
    )
