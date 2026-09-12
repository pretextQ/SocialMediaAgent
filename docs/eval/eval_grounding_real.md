# 数据准确性报告（数字是否有出处）

> 事实性大数字 = 报告中 **≥1000 的整数**（排除 KPI 小节——KPI 是目标值，不是事实）。
> grounded = 该数字能在序列化后的 facts 中找到出处。
> **局限**：抓不到编造的小数字；也不能判断「数字被安在了正确的指标上」。

## 汇总

| 用例数 | 轮次 | 事实性数字 | 无出处数字 | grounded 率（均值 ± 总体标准差） |
| --- | --- | --- | --- | --- |
| 4 | 3 | 18 | 0 | 100% ± 0% |

## 逐用例明细（每轮原始观测）

| 用例 | 轮次 | 类型 | 目标 | 数字数 | 无出处数字 | grounded 率 |
| --- | --- | --- | --- | --- | --- | --- |
| real-gaogang-strategy | 1 | account | bilibili:21401670 | 1 | - | 100% |
| real-tongyi-strategy | 1 | account | bilibili:3546585589877706 | 1 | - | 100% |
| real-gaogang-content | 1 | content | bilibili:BV1DKGE6NE1U | 3 | - | 100% |
| real-tongyi-content | 1 | content | bilibili:BV1yyQEBdEZX | 1 | - | 100% |
| real-gaogang-strategy | 2 | account | bilibili:21401670 | 1 | - | 100% |
| real-tongyi-strategy | 2 | account | bilibili:3546585589877706 | 0 | - | 100% |
| real-gaogang-content | 2 | content | bilibili:BV1DKGE6NE1U | 4 | - | 100% |
| real-tongyi-content | 2 | content | bilibili:BV1yyQEBdEZX | 1 | - | 100% |
| real-gaogang-strategy | 3 | account | bilibili:21401670 | 1 | - | 100% |
| real-tongyi-strategy | 3 | account | bilibili:3546585589877706 | 1 | - | 100% |
| real-gaogang-content | 3 | content | bilibili:BV1DKGE6NE1U | 3 | - | 100% |
| real-tongyi-content | 3 | content | bilibili:BV1yyQEBdEZX | 1 | - | 100% |