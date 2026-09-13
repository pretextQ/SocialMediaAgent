"""Trend Analysis 节点。

gather：经内部 Tool 收集 DB 事实（get_trend_data 按平台+周期取话题）
analyze：LLM 结构化输出；失败或未配置 gateway 时规则兜底（确定性、可核验）；
        无论 LLM 还是兜底，topics 一律以 DB 事实回填（杜绝编造话题）
report：由结构化结果规则渲染人类可读 markdown
"""

from __future__ import annotations

from socialmedia_agent.agents.common import (
    AnalyzeSource,
    invoke_tool,
    llm_analyze_with_source,
    render_markdown,
)
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.agents.trend_analysis.prompts import SYSTEM_PROMPT
from socialmedia_agent.agents.trend_analysis.schemas import TrendAnalysisOutput, TrendTopic
from socialmedia_agent.llm.gateway import LLMGateway


def gather(registry: ToolRegistry, platform: str, period: int) -> dict:
    """收集趋势分析所需 DB 事实（只经 Tool）。"""
    trends = invoke_tool(registry, "get_trend_data", platform=platform, period=period)
    return {"platform": platform, "period": period, "trends": trends}


def analyze_with_source(
    gateway: LLMGateway | None, facts: dict
) -> tuple[TrendAnalysisOutput, AnalyzeSource]:
    """LLM 结构化输出 + 实际来源；topics 一律回填 DB 事实。"""
    out, source = llm_analyze_with_source(
        gateway, SYSTEM_PROMPT, facts, TrendAnalysisOutput, fallback=_rule_fallback
    )
    out.topics = _db_topics(facts)
    return out, source


def analyze(gateway: LLMGateway | None, facts: dict) -> TrendAnalysisOutput:
    """LLM 结构化输出；失败或未配置 gateway 时规则兜底；topics 回填 DB 事实。"""
    out, _source = analyze_with_source(gateway, facts)
    return out


def _db_topics(facts: dict) -> list[TrendTopic]:
    return [
        TrendTopic(
            keyword=t["keyword"],
            title=t.get("title"),
            post_count=int(t.get("post_count", 0)),
        )
        for t in (facts.get("trends") or [])
    ]


def _rule_fallback(facts: dict) -> TrendAnalysisOutput:
    """确定性规则兜底：trend_score 由话题 post_count 计算（可核验）。"""
    platform = facts.get("platform", "")
    period = int(facts.get("period", 7))
    trends = facts.get("trends") or []

    insights: list[str] = []
    score = 0
    if trends:
        score = min(100, 20 + 15 * len(trends) + min(25, sum(int(t["post_count"]) for t in trends)))
        top = trends[0]  # 已按 post_count 降序
        insights.append(f"热度最高话题：{top['keyword']}（{top['post_count']} 条）")
        if len(trends) > 1:
            insights.append(f"本期共监测到 {len(trends)} 个趋势话题")
    else:
        insights.append("当前周期无趋势话题数据")

    return TrendAnalysisOutput(
        platform=platform,
        period=period,
        topics=_db_topics(facts),
        trend_score=score,
        insights=insights,
    )


def render_report(analysis: TrendAnalysisOutput, facts: dict) -> str:
    """由结构化结果渲染人类可读 markdown（确定性）。"""
    topics_items = [f"{t.keyword}（{t.post_count} 条）" for t in analysis.topics]
    sections = [
        ("热门话题", topics_items),
        ("洞察", analysis.insights),
    ]
    return render_markdown(
        title=f"趋势分析报告：{analysis.platform}（近 {analysis.period} 天）",
        sections=sections,
        intro=[f"- 趋势评分：**{analysis.trend_score}/100**"],
    )
