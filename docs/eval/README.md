# 评测证据（可复核数字）

这里存放**真实跑出来的评测报告原文**。它们不是设计文档，而是**证据**：复盘或面试时可以直接指着这些
数字说话，无需重跑（LLM 相关重跑需要 API Key 与真实库）。

| 报告 | 说明 |
| --- | --- |
| `eval_before_runs3.md` | 修复**前**的工具选择评测（rules 每例重复取数 3 次） |
| `eval_after_runs3.md` | 修复**后**（重复调用 3.00 → 0.00） |
| `eval_real_runs3.md` | **真实公开数据**上的工具选择评测（rules 100% vs llm 50%） |
| `eval_grounding_real.md` | 数据准确性：报告中的数字是否可溯源 |
| `eval_quality_real.md` | 输出质量（LLM 评委，**分数不是 ground truth**） |
| `eval_retrieval_k3.md` | RAG 检索质量（确定性，**不需要密钥**） |
| `eval_report.md` | 最早一版单轮报告，保留用于对照「单轮不可信」 |

## 怎么重跑

在 `app/backend` 下、用项目解释器执行：

```powershell
# 1) 工具选择（真实数据；需要 LLM_API_KEY 与 data/sma_real.db）
.venv/Scripts/python.exe -m socialmedia_agent.evaluation.runner `
  --cases src/socialmedia_agent/evaluation/cases/account_strategy_real.json `
  --db-url sqlite:///data/sma_real.db --memory-url sqlite:///data/sma_real_memory.db `
  --modes rules,llm --runs 3 --report ../docs/eval/eval_real_runs3.md

# 2) 数据准确性 / 输出质量（同样需要密钥）
.venv/Scripts/python.exe -m socialmedia_agent.evaluation.grounding_runner `
  --cases src/socialmedia_agent/evaluation/cases/grounding.json --runs 3
.venv/Scripts/python.exe -m socialmedia_agent.evaluation.quality_runner `
  --cases src/socialmedia_agent/evaluation/cases/quality.json --runs 3

# 3) RAG 检索（确定性，无需密钥；CI 里跑的就是这条）
.venv/Scripts/python.exe -m socialmedia_agent.evaluation.retrieval_runner `
  --cases src/socialmedia_agent/evaluation/cases/retrieval.json --k 3 `
  --report ../docs/eval/eval_retrieval_k3.md
```

真实库由入库的 CSV 重建：

```powershell
.venv/Scripts/python.exe -m socialmedia_agent.cli.import_csv --input seed/real_public.csv --db-url sqlite:///data/sma_real.db
```
