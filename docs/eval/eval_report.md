# 工具选择评测报告

> recall = 命中期望工具 / 期望工具数；precision = 命中 / 实际去重后工具数；
> 重复调用 = 实际调用次数 - 去重后数量。

## 汇总

| 模式 | 用例数 | recall | precision | f1 | 完全匹配率 | 重复调用 |
| --- | --- | --- | --- | --- | --- | --- |
| rules | 2 | 1.000 | 1.000 | 1.000 | 100% | 6 |
| llm | 2 | 1.000 | 1.000 | 1.000 | 100% | 0 |

## 逐用例明细

| 用例 | 模式 | source | 实际工具 | 漏调 | 多调 | 重复 |
| --- | --- | --- | --- | --- | --- | --- |
| demo-healthy | rules | rules | get_account_profile, analyze_content_performance, get_recent_contents, get_historical_strategy, get_trend_data, get_account_profile, get_recent_contents, get_trend_data, search_operation_knowledge | - | - | 3 |
| demo-declining | rules | rules | get_account_profile, analyze_content_performance, get_recent_contents, get_historical_strategy, get_trend_data, get_account_profile, get_recent_contents, get_trend_data, search_operation_knowledge | - | - | 3 |
| demo-healthy | llm | llm | get_account_profile, analyze_content_performance, get_recent_contents, get_historical_strategy, get_trend_data, search_operation_knowledge | - | - | 0 |
| demo-declining | llm | llm | get_account_profile, analyze_content_performance, get_recent_contents, get_historical_strategy, get_trend_data, search_operation_knowledge | - | - | 0 |