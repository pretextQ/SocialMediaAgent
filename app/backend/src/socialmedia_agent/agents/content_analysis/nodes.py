"""Content Analysis 节点。

gather：经内部 Tool 收集 DB 事实（内容详情 / 指标 / 账号聚合 / 运营知识）
analyze：LLM 结构化输出；失败或未配置 gateway 时规则兜底（确定性、可核验）
report：由结构化结果规则渲染人类可读 markdown
"""

from __future__ import annotations

from socialmedia_agent.agents.common import invoke_tool, llm_analyze, render_markdown
from socialmedia_agent.agents.content_analysis.prompts import SYSTEM_PROMPT
from socialmedia_agent.agents.content_analysis.schemas import ContentAnalysisOutput
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.llm.gateway import LLMGateway


def gather(registry: ToolRegistry, content_id: str) -> dict:
    """收集单条内容分析所需 DB 事实（只经 Tool）。"""
    details = invoke_tool(registry, "get_content_details", content_id=content_id)
    metrics = invoke_tool(registry, "get_content_metrics", content_id=content_id)
    account_id = (details or {}).get("account_id")
    perf = (
        invoke_tool(registry, "analyze_content_performance", account_id=account_id)
        if account_id
        else {}
    )
    knowledge = invoke_tool(
        registry, "search_operation_knowledge", query="内容质量评估", top_k=3
    )
    return {
        "content_id": content_id,
        "content": details or {},
        "metrics": metrics,
        "account_performance": perf,
        "knowledge": knowledge,
    }


def analyze(gateway: LLMGateway | None, facts: dict) -> ContentAnalysisOutput:
    """LLM 结构化输出；失败或未配置 gateway 时规则兜底。"""
    return llm_analyze(
        gateway, SYSTEM_PROMPT, facts, ContentAnalysisOutput, fallback=_rule_fallback
    )


def _rule_fallback(facts: dict) -> ContentAnalysisOutput:
    """确定性规则兜底：指标值 vs 账号均值计算质量评分（可核验）。"""
    content_id = facts.get("content_id", "")
    content = facts.get("content") or {}
    metrics = facts.get("metrics") or []
    perf = facts.get("account_performance") or {}

    by_type: dict[str, float] = {}
    for m in metrics:
        try:
            by_type[m["metric_type"]] = float(m["value"])
        except (TypeError, ValueError):
            continue
    views = by_type.get("views", 0.0)
    likes = by_type.get("likes", 0.0)
    comments = by_type.get("comments", 0.0)

    content_count = int(perf.get("content_count", 0))
    total_views = float(perf.get("total_views", "0") or 0)
    avg_views = total_views / content_count if content_count else 0.0

    strengths: list[str] = []
    weaknesses: list[str] = []
    suggestions: list[str] = []
    score = 50

    if not metrics:
        weaknesses.append("暂无指标数据")
        suggestions.append("等待数据采集后重新分析")
        score = 30
    else:
        if avg_views > 0 and views >= avg_views:
            strengths.append("播放量高于账号均值")
            score += 20
        elif avg_views > 0:
            weaknesses.append("播放量低于账号均值")
            score -= 10
        if views > 0 and likes > 0:
            if likes / views >= 0.03:
                strengths.append("点赞互动良好")
                score += 10
            else:
                weaknesses.append("点赞率偏低")
                suggestions.append("优化内容开头钩子以提升点赞")
        if comments > 0:
            strengths.append("评论互动活跃")
            score += 10
        else:
            weaknesses.append("评论互动不足")
            suggestions.append("设置话题或提问引导评论")

    score = max(0, min(100, score))
    return ContentAnalysisOutput(
        content_id=content_id,
        title=content.get("title"),
        summary="规则兜底生成的内容质量摘要",
        quality_score=score,
        strengths=strengths,
        weaknesses=weaknesses,
        suggestions=suggestions,
    )


def render_report(analysis: ContentAnalysisOutput, facts: dict) -> str:
    """由结构化结果渲染人类可读 markdown（确定性）。"""
    content = facts.get("content") or {}
    title = analysis.title or content.get("title") or facts.get("content_id", "未知内容")
    sections = [
        ("摘要", [analysis.summary] if analysis.summary else []),
        ("优势", analysis.strengths),
        ("不足", analysis.weaknesses),
        ("建议", analysis.suggestions),
    ]
    return render_markdown(
        title=f"内容分析报告：{title}",
        sections=sections,
        intro=[f"- 质量评分：**{analysis.quality_score}/100**"],
    )
