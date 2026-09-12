# ADR-0003: Account Diagnosis Agent（P3）构建方式

- 状态：已接受（**部分被取代**：P5.5.1 起 `agents/account_diagnosis/` 并入 `agents/account_strategy/`，诊断输出成为其子集；本 ADR 的分层决策仍然有效）
- 日期：2026-08-24
- 相关阶段：P3
- 来源模块：
  - `third_party/MatrixFlow-main/electron/services/AnomalyService.ts`: `report()` / `getActiveAlerts()`
  - `third_party/MatrixFlow-main/electron/ai/AIService.ts`: `detectAnomaly()`（:250 映射表）

## 背景

- P3 目标（见 `docs/status.md` 的 DoD 对照）：首个 Agent —— **Account Diagnosis Agent**，输入账号 + 近期内容 + 历史指标，输出严格 JSON 契约 + 人类可读报告；输出 schema 有回归测试；**Agent 引用的统计数字与 DB 可核验**（为 P6 铺垫）。
- 目录设计：`agents/account_diagnosis/`（graph.py / nodes.py / prompts.py / schemas.py）。**该目录在 P5.5.1 后已不存在**，等价实现位于 `agents/account_strategy/`，诊断子集由 `AccountStrategyOutput.to_diagnosis()` 提取。
- 三线表（`docs/adr/README.md`）：AI 规则兜底（`AIService.ts: ruleBasedPrePublishCheck()`）初判「参考」；`AnomalyService` / `detectAnomaly` 未见单独条目，本 ADR 一并决策。

## 决策

**重新实现**，且分层如下：

1. **数据获取**：gather 节点只通过已注册的内部 Tool（`get_account_profile` / `analyze_content_performance` / `get_recent_contents` / `get_historical_strategy`）读取核心库 / Memory，DB 事实显式注入 prompt，**LLM 不编造业务数据**（AGENTS.md：数据库事实和 LLM 推理必须明确区分）。
2. **结构化输出**：LLM Gateway（json 模式 + `DiagnosisOutput` pydantic schema 校验）产出严格契约字段；LLM 失败时**规则兜底**（参考 AIService 思路）产出确定性诊断，保证可用性。
3. **人类报告**：报告节点由结构化结果**规则渲染**为 markdown（确定性、可测），不依赖 LLM 二次生成。
4. **异常检测**：不移植 MatrixFlow `AnomalyService` 的 severity/action 映射（其 `detectAnomaly` 是纯映射表、不计算指标，见 source-analysis.md:49），改由 LLM 基于注入的 DB 指标事实识别，配合规则兜底。
5. **可核验**：诊断输入 facts（含 DB 统计数字）记录在 state 中；回归测试断言 LLM prompt 内含正确 DB 数字，为 P6 ground_truth 对比打底。

## 理由

- 与 AGENTS.md 一致：Agent 通过 Tool/Service 取数，不直接访问 DB；DB 事实与 LLM 推理分离。
- 源码事实：MatrixFlow 的 `AnomalyService`/`detectAnomaly` 只是映射表，不具备统计能力，移植价值低；规则兜底思路值得参考（三线表已判「参考」）。
- P3 DoD 明确要求输出 schema 固定 + 统计可核验，分层设计（数据注入 → LLM 分析 → 规则渲染报告）使两者都可测。

## 验证方式

- `tests/agent/test_account_diagnosis.py`（fixture：内存 SQLite + 假 LLM + 知识库样本）：
  - 端到端：输入 account_id → `DiagnosisOutput` 严格 schema（account_health 0-100，四个 list 字段）
  - LLM 返回非法 JSON / pydantic 校验失败 → 规则兜底输出仍满足 schema
  - 人类报告非空且包含结构化字段
  - 统计数字核验：LLM prompt 包含 DB 中的 total_views 等事实
  - 回归：schema 契约测试（P3 DoD）

## 后果

- 正面：首个 Agent 可端到端演示；输出契约固定，P6 Evaluation 可直接对拍。
- 负面 / 风险：规则兜底质量依赖规则覆盖度；真实 LLM 效果需 P1 真机数据 + 实际密钥联调（`.env`，不入库）。

## 参考代码

- MatrixFlow：`AnomalyService.ts`（report/getActiveAlerts）、`AIService.ts`（ruleBasedPrePublishCheck / detectAnomaly）。
- 本项目：`llm/gateway.py`（LLMCallResult + json/pydantic 校验）、`agents/tools/`（Tool 取数）。
