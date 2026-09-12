"""输出质量评委（P6）。

**这不是 ground truth。** 评委本身是 LLM，它的分数只能作**相对信号**（回归对比、版本间比较），
不能当绝对质量结论。另外存在**自偏好**风险（评委可能偏好与自己相似的文风）——本项目只配置了
一个模型端点，无法用不同模型互评，这一点必须在使用时记住。

rubric（固定，各自 0-100）：

- `specificity`  具体性：是否给出可执行的细节，而不是泛泛而谈
- `structure`    结构完整性：该有的分节是否齐全、有没有空话填充
- `conciseness`  简洁性：是否有重复与废话
- `overall`      总体可用性
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from socialmedia_agent.llm.gateway import LLMGateway

JUDGE_SYSTEM_PROMPT = """你是严格但公正的内容运营报告评审。请对给定报告按三个维度打分（0-100），
并给出 0-100 的总分与一句理由：

- specificity 具体性：是否给出可执行的细节，而不是泛泛而谈
- structure 结构完整性：该有的分节是否齐全、有没有空话填充
- conciseness 简洁性：是否有重复与废话

只输出 JSON：{"specificity": int, "structure": int, "conciseness": int, "overall": int, "rationale": str}
打分标准必须稳定：同样的报告应得到大致相同的分数。"""


class QualityJudgement(BaseModel):
    specificity: int = Field(ge=0, le=100)
    structure: int = Field(ge=0, le=100)
    conciseness: int = Field(ge=0, le=100)
    overall: int = Field(ge=0, le=100)
    rationale: str = ""


def judge_quality(
    gateway: LLMGateway | None, report: str, facts: dict
) -> QualityJudgement | None:
    """让评委打分；调用/解析失败返回 None（记为失败，**不伪造分数**）。"""
    if gateway is None:
        raise ValueError("输出质量评测需要 gateway（评委也是 LLM）；无 gateway 时请勿调用")

    user = (
        "以下是待评审报告，以及它应当依据的数据库事实：\n\n"
        f"## 报告\n{report}\n\n## 数据库事实\n{facts}"
    )
    result = gateway.call(
        JUDGE_SYSTEM_PROMPT,
        user,
        response_format="json",
        response_model=QualityJudgement,
    )
    if result.success and isinstance(result.data, QualityJudgement):
        return result.data
    return None
