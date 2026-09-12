"""数据准确性（数字可溯源）评分测试（TDD，P6）。

口径：

- **事实性大数字** = 报告中 ≥ 1000 的整数（<1000 多为评分 0-100、百分比、条数等派生值）
- **排除 KPI 小节**：KPI 是**目标值**不是事实（如「首月累计播放量达到 10000」），
  把它算成「编造」会误伤——这是本指标最容易出错的地方。
- grounded = 该数字出现在序列化后的 facts 文本里
"""

from socialmedia_agent.evaluation import extract_factual_numbers, score_grounding


def test_extracts_numbers_at_or_above_threshold():
    assert extract_factual_numbers("播放 25179 次，点赞 545") == ["25179"]


def test_ignores_scores_and_percentages():
    assert extract_factual_numbers("健康度 75/100，提升 30%") == []


def test_extraction_is_deduped_and_order_preserving():
    assert extract_factual_numbers("25179 和 8888 再来一次 25179") == ["25179", "8888"]


def test_excludes_kpi_section():
    report = (
        "## 优势\n- 播放 25179\n"
        "## KPI\n- 首月累计播放量达到 10000\n"
        "## 风险\n- 内容同质化"
    )
    numbers = extract_factual_numbers(report)

    assert numbers == ["25179"]


def test_grounded_when_number_appears_in_facts():
    facts = {"performance": {"total_views": "25179.0000"}}

    score = score_grounding("## 优势\n- 播放 25179 次", facts)

    assert score.grounded == ["25179"]
    assert score.ungrounded == []
    assert score.grounded_rate == 1.0


def test_ungrounded_when_number_is_invented():
    facts = {"performance": {"total_views": "25179"}}

    score = score_grounding("## 优势\n- 播放 99999 次", facts)

    assert score.grounded == []
    assert score.ungrounded == ["99999"]
    assert score.grounded_rate == 0.0


def test_mixed_numbers_report_partial_rate():
    facts = {"performance": {"total_views": "25179"}}

    score = score_grounding("## 优势\n- 播放 25179，另有 77777 次曝光", facts)

    assert score.grounded == ["25179"]
    assert score.ungrounded == ["77777"]
    assert score.grounded_rate == 0.5


def test_no_factual_numbers_scores_perfect():
    score = score_grounding("## 优势\n- 更新稳定\n## KPI\n- 目标 10000", {})

    assert score.report_numbers == []
    assert score.grounded_rate == 1.0
