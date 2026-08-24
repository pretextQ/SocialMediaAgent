"""Account Diagnosis 节点。

gather：通过内部 Tool 收集 DB 事实（账号资料 / 内容 / 指标 / Memory）
analyze：LLM Gateway 结构化输出；失败时规则兜底（保证契约）
report：由结构化结果规则渲染人类可读 markdown（确定性）
"""

from __future__ import annotations

from typing import Any

from socialmedia_agent.agents.account_diagnosis.prompts import SYSTEM_PROMPT, build_facts_prompt
from socialmedia_agent.agents.account_diagnosis.schemas import DiagnosisOutput
from socialmedia_agent.agents.tools.registry import ToolRegistry
from socialmedia_agent.llm.gateway import LLMGateway


def _invoke(registry: ToolRegistry, name: str, **kwargs: Any) -> Any:
    return registry.get(name).invoke(**kwargs)


def gather(registry: ToolRegistry, account_id: str) -> dict:
    """收集账号诊断所需 DB 事实（只经 Tool）。"""
    profile = _invoke(registry, "get_account_profile", account_id=account_id)
    perf = _invoke(registry, "analyze_content_performance", account_id=account_id)
    recent = _invoke(registry, "get_recent_contents", account_id=account_id, limit=5)
    strategy = _invoke(registry, "get_historical_strategy", account_id=account_id)
    return {
        "account_id": account_id,
        "profile": profile,
        "performance": perf,
        "recent_contents": recent,
        "historical_strategy": strategy,
    }


def analyze(gateway: LLMGateway, facts: dict) -> DiagnosisOutput:
    """LLM 结构化输出；失败时规则兜底。"""
    prompt = SYSTEM_PROMPT
    text = build_facts_prompt(facts)
    result = gateway.call(prompt, text, response_format="json", response_model=DiagnosisOutput)
    if result.success and isinstance(result.data, DiagnosisOutput):
        return result.data
    return _rule_fallback(facts)


def _rule_fallback(facts: dict) -> DiagnosisOutput:
    """确定性规则兜底：基于 DB 事实给出保守诊断。"""
    perf = facts.get("performance") or {}
    content_count = int(perf.get("content_count", 0))
    total_views = float(perf.get("total_views", "0") or 0)

    weaknesses: list[str] = []
    recommendations: list[str] = []
    health = 50

    if content_count == 0:
        weaknesses.append("近期无内容产出")
        recommendations.append("恢复稳定更新节奏")
        health = 30
    else:
        avg_views = total_views / content_count if content_count else 0
        if avg_views < 100:
            weaknesses.append("平均播放量偏低")
            recommendations.append("优化标题与封面，提升点击率")
            health = 40
        elif avg_views < 1000:
            weaknesses.append("平均播放量中等，有提升空间")
            recommendations.append("强化内容差异化，稳定更新")
            health = 60
        else:
            health = 75

    return DiagnosisOutput(
        account_health=health,
        strengths=["更新稳定" if content_count else ""] if content_count else [],
        weaknesses=weaknesses,
        anomalies=[],
        recommendations=recommendations,
    )


def render_report(diagnosis: DiagnosisOutput, facts: dict) -> str:
    """由结构化结果渲染人类可读 markdown（确定性）。"""
    profile = facts.get("profile") or {}
    nickname = profile.get("nickname") or facts.get("account_id", "未知账号")
    lines = [
        f"# 账号诊断报告：{nickname}",
        "",
        f"- 账号健康度：**{diagnosis.account_health}/100**",
        "",
        "## 优势",
    ]
    lines.extend(f"- {item}" for item in diagnosis.strengths)
    if not diagnosis.strengths:
        lines.append("- （无）")
    lines.append("")
    lines.append("## 不足")
    lines.extend(f"- {item}" for item in diagnosis.weaknesses)
    if not diagnosis.weaknesses:
        lines.append("- （无）")
    lines.append("")
    lines.append("## 异常")
    lines.extend(f"- {item}" for item in diagnosis.anomalies)
    if not diagnosis.anomalies:
        lines.append("- （无）")
    lines.append("")
    lines.append("## 建议")
    lines.extend(f"- {item}" for item in diagnosis.recommendations)
    if not diagnosis.recommendations:
        lines.append("- （无）")
    return "\n".join(lines)
