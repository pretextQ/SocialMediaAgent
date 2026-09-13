# 输出质量报告（LLM 评委）

> ⚠️ **评委是 LLM，这份分数不是 ground truth**：只能作相对信号（回归 / 版本对比），
> 不能当绝对质量结论；也存在自偏好（评委可能偏向自己的文风）。
> 维度：specificity 具体性 / structure 结构完整性 / conciseness 简洁性 / overall 总体。

## 汇总

| 用例数 | 轮次 | 成功评分 | 失败 | overall（均值 ± 总体标准差） |
| --- | --- | --- | --- | --- |
| 2 | 3 | 6 | 0 | 81.2 ± 2.1 |

## 逐用例明细（每轮原始观测）

| 用例 | 轮次 | 类型 | 目标 | specificity | structure | conciseness | overall |
| --- | --- | --- | --- | --- | --- | --- | --- |
| real-gaogang-strategy | 1 | account | bilibili:21401670 | 82 | 90 | 68 | 80 |
| real-tongyi-content | 1 | content | bilibili:BV1yyQEBdEZX | 78 | 85 | 72 | 78 |
| real-gaogang-strategy | 2 | account | bilibili:21401670 | 82 | 90 | 74 | 82 |
| real-tongyi-content | 2 | content | bilibili:BV1yyQEBdEZX | 85 | 90 | 88 | 86 |
| real-gaogang-strategy | 3 | account | bilibili:21401670 | 72 | 88 | 66 | 76 |
| real-tongyi-content | 3 | content | bilibili:BV1yyQEBdEZX | 86 | 90 | 80 | 85 |