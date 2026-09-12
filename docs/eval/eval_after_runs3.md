# 工具选择评测报告

> recall = 命中期望工具 / 期望工具数；precision = 命中 / 实际去重后工具数；
> 重复调用 = 实际调用次数 - 去重后数量。
> 多轮（--runs>1）：先按轮对各用例求均值，再跨轮给出 **均值 ± 总体标准差**；
> 单轮时标准差恒为 0，请以「轮次」列为准，不要当成「结论稳定」。

## 汇总

| 模式 | 用例数 | 轮次 | recall | precision | f1 | 完全匹配率 | 重复调用 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| rules | 2 | 3 | 1.000 ± 0.000 | 1.000 ± 0.000 | 1.000 ± 0.000 | 100% ± 0% | 0.00 ± 0.00 |
| llm | 2 | 3 | 1.000 ± 0.000 | 1.000 ± 0.000 | 1.000 ± 0.000 | 100% ± 0% | 0.17 ± 0.24 |

## 逐用例明细（每轮原始观测）

| 用例 | 轮次 | 模式 | source | 实际工具 | 漏调 | 多调 | 重复 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| demo-healthy | 1 | rules | rules | get_account_profile, get_recent_contents, get_trend_data, analyze_content_performance, get_historical_strategy, search_operation_knowledge | - | - | 0 |
| demo-declining | 1 | rules | rules | get_account_profile, get_recent_contents, get_trend_data, analyze_content_performance, get_historical_strategy, search_operation_knowledge | - | - | 0 |
| demo-healthy | 1 | llm | llm | get_account_profile, analyze_content_performance, get_recent_contents, get_historical_strategy, get_trend_data, search_operation_knowledge, get_trend_data | - | - | 1 |
| demo-declining | 1 | llm | llm | get_account_profile, analyze_content_performance, get_recent_contents, get_historical_strategy, get_trend_data, search_operation_knowledge | - | - | 0 |
| demo-healthy | 2 | rules | rules | get_account_profile, get_recent_contents, get_trend_data, analyze_content_performance, get_historical_strategy, search_operation_knowledge | - | - | 0 |
| demo-declining | 2 | rules | rules | get_account_profile, get_recent_contents, get_trend_data, analyze_content_performance, get_historical_strategy, search_operation_knowledge | - | - | 0 |
| demo-healthy | 2 | llm | llm | get_account_profile, analyze_content_performance, get_recent_contents, get_historical_strategy, get_trend_data, search_operation_knowledge | - | - | 0 |
| demo-declining | 2 | llm | llm | get_account_profile, analyze_content_performance, get_recent_contents, get_historical_strategy, get_trend_data, search_operation_knowledge | - | - | 0 |
| demo-healthy | 3 | rules | rules | get_account_profile, get_recent_contents, get_trend_data, analyze_content_performance, get_historical_strategy, search_operation_knowledge | - | - | 0 |
| demo-declining | 3 | rules | rules | get_account_profile, get_recent_contents, get_trend_data, analyze_content_performance, get_historical_strategy, search_operation_knowledge | - | - | 0 |
| demo-healthy | 3 | llm | llm | get_account_profile, analyze_content_performance, get_recent_contents, get_historical_strategy, get_trend_data, search_operation_knowledge | - | - | 0 |
| demo-declining | 3 | llm | llm | get_account_profile, analyze_content_performance, get_recent_contents, get_historical_strategy, get_trend_data, search_operation_knowledge | - | - | 0 |