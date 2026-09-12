"""数据准确性：报告里的「事实性大数字」是否都能在 DB 事实中找到出处（P6）。

**为什么需要**：契约测试只保证字段存在，不保证数字有出处。LLM 完全可能把库里的
25179 换成一个「看起来合理」的 25999——格式合法、契约通过、但事实是错的。

口径（钉死）：

- **事实性大数字** = 报告中 ≥ `MIN_FACTUAL_VALUE`(1000) 的整数。
  <1000 的数字与评分（0-100）、百分比、条数混在一起，无法可靠区分。
- **排除 KPI 小节**：KPI 是**目标值**不是事实（如「首月累计播放量达到 10000」）。
  把它算成「编造」会误伤——这是本指标最容易出错的地方。
- grounded = 该数字出现在**序列化后的 facts 文本**中（与 prompt 注入的表示一致）。

局限（必须知道，不要过度解读）：

- 抓不到「编造的小数字」；
- 只能验证「数字**有出处**」，**不能**验证「数字被安在了**正确的指标**上」
  （把点赞数写成播放数仍会判为 grounded）。
"""

from __future__ import annotations

import re

from .models import GroundingScore

MIN_FACTUAL_VALUE = 1000

_KPI_HEADING = re.compile(r"^##\s*KPI\b", re.IGNORECASE)
_SECTION_HEADING = re.compile(r"^##\s")
_NUMBER = re.compile(r"\d+")


def strip_kpi_section(report: str) -> str:
    """去掉 KPI 小节——目标是「要做到多少」，不是「事实是多少」。"""
    kept: list[str] = []
    skipping = False
    for line in report.splitlines():
        if _SECTION_HEADING.match(line):
            skipping = bool(_KPI_HEADING.match(line))
            if skipping:
                continue
        if not skipping:
            kept.append(line)
    return "\n".join(kept)


def extract_factual_numbers(report: str, min_value: int = MIN_FACTUAL_VALUE) -> list[str]:
    """抽取报告中的事实性大数字（去重、保持出现顺序）。"""
    seen: set[str] = set()
    result: list[str] = []
    for token in _NUMBER.findall(strip_kpi_section(report)):
        if int(token) < min_value or token in seen:
            continue
        seen.add(token)
        result.append(token)
    return result


def score_grounding(
    report: str, facts: dict, min_value: int = MIN_FACTUAL_VALUE
) -> GroundingScore:
    """按「数字是否有出处」给报告打分。`facts` 用与 prompt 相同的 dict 表示序列化。"""
    numbers = extract_factual_numbers(report, min_value)
    facts_text = str(facts)
    grounded = [n for n in numbers if n in facts_text]
    ungrounded = [n for n in numbers if n not in facts_text]
    rate = len(grounded) / len(numbers) if numbers else 1.0
    return GroundingScore(
        report_numbers=numbers,
        grounded=grounded,
        ungrounded=ungrounded,
        grounded_rate=rate,
    )
