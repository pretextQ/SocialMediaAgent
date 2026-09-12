# 工具选择评测报告

> recall = 命中期望工具 / 期望工具数；precision = 命中 / 实际去重后工具数；
> 重复调用 = 实际调用次数 - 去重后数量。
> 多轮（--runs>1）：先按轮对各用例求均值，再跨轮给出 **均值 ± 总体标准差**；
> 单轮时标准差恒为 0，请以「轮次」列为准，不要当成「结论稳定」。

## 汇总

| 模式 | 用例数 | 轮次 | recall | precision | f1 | 完全匹配率 | 重复调用 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| rules | 2 | 3 | 1.000 ± 0.000 | 1.000 ± 0.000 | 1.000 ± 0.000 | 100% ± 0% | 0.00 ± 0.00 |
| llm | 2 | 3 | 0.917 ± 0.000 | 1.000 ± 0.000 | 0.955 ± 0.000 | 50% ± 0% | 0.00 ± 0.00 |

## 逐用例明细（每轮原始观测）

| 用例 | 轮次 | 模式 | source | 实际工具 | 漏调 | 多调 | 重复 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| real-gaogang | 1 | rules | rules | get_account_profile, get_recent_contents, get_trend_data, analyze_content_performance, get_historical_strategy, search_operation_knowledge | - | - | 0 |
| real-tongyi | 1 | rules | rules | get_account_profile, get_recent_contents, get_trend_data, analyze_content_performance, get_historical_strategy, search_operation_knowledge | - | - | 0 |
| real-gaogang | 1 | llm | llm | get_account_profile, analyze_content_performance, get_recent_contents, get_historical_strategy, get_trend_data | search_operation_knowledge | - | 0 |
| real-tongyi | 1 | llm | llm | get_account_profile, analyze_content_performance, get_recent_contents, get_historical_strategy, get_trend_data, search_operation_knowledge | - | - | 0 |
| real-gaogang | 2 | rules | rules | get_account_profile, get_recent_contents, get_trend_data, analyze_content_performance, get_historical_strategy, search_operation_knowledge | - | - | 0 |
| real-tongyi | 2 | rules | rules | get_account_profile, get_recent_contents, get_trend_data, analyze_content_performance, get_historical_strategy, search_operation_knowledge | - | - | 0 |
| real-gaogang | 2 | llm | llm | get_account_profile, analyze_content_performance, get_recent_contents, get_historical_strategy, get_trend_data, search_operation_knowledge | - | - | 0 |
| real-tongyi | 2 | llm | llm | get_account_profile, analyze_content_performance, get_recent_contents, get_historical_strategy, get_trend_data | search_operation_knowledge | - | 0 |
| real-gaogang | 3 | rules | rules | get_account_profile, get_recent_contents, get_trend_data, analyze_content_performance, get_historical_strategy, search_operation_knowledge | - | - | 0 |
| real-tongyi | 3 | rules | rules | get_account_profile, get_recent_contents, get_trend_data, analyze_content_performance, get_historical_strategy, search_operation_knowledge | - | - | 0 |
| real-gaogang | 3 | llm | llm | get_account_profile, analyze_content_performance, get_recent_contents, get_historical_strategy, get_trend_data, search_operation_knowledge | - | - | 0 |
| real-tongyi | 3 | llm | llm | get_account_profile, analyze_content_performance, get_recent_contents, get_historical_strategy, get_trend_data | search_operation_knowledge | - | 0 |