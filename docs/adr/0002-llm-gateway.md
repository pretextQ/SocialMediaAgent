# ADR-0002: LLM Gateway（llm/gateway.py）重新实现

- 状态：已接受
- 日期：2026-08-24
- 相关阶段：P2
- 来源模块：
  - `third_party/MediaRadar-main/backend/services/radar_service/llm_gateway.py`: `call_llm` / `clean_json_string` / `_call_llm_inner`
  - `third_party/MediaRadar-main/backend/core/circuit_breaker.py`: `CircuitBreaker`
  - `third_party/MatrixFlow-main/electron/ai/LLMService.ts`: `call()` / `callProvider()`

## 背景

- P2 需要统一的 LLM 调用能力：text / JSON 模式、pydantic 结构化输出校验、重试、熔断、多提供商。
- 架构中的位置（`docs/architecture-analysis.md`）：`接入层 → Agent层 → LLM Gateway`，LLM Gateway 是 Agent 与外部模型之间唯一边界，业务层只依赖本模块接口。
- 三线表（`docs/adr/README.md`）对两条候选行的初判均为「重新实现」：
  - MatrixFlow `LLMService.ts`（`ai/LLMService.ts: call()/callProvider()`）→ 重新实现；无 JSON 模式/熔断/重试，`fallbackToRules` 分支存在与注释相悖的 bug（`:72-74`）。
  - MediaRadar `llm_gateway.py` + `core/circuit_breaker.py` → 重新实现；借鉴熔断/重试/pydantic 校验思路。

## 决策

**重新实现**。在 `app/` 内以 Python 自建 `llm/` 模块，不 import 任何第三方项目的 LLM 代码。

## 理由

- 对 MediaRadar `llm_gateway.py` 的源码核验发现其结构不适合直接采用：
  - `call_llm` 返回值类型混乱（`str` / `dict` / `LLMCallResult` 混用），调用方难以区分成败；
  - 熔断器与 Prometheus metrics（`core/metrics`）硬耦合，我们无此基建；
  - 引擎选择硬编码为 `deepseek` / `kimi` 双客户端（`:66-82`），与「多提供商可插拔」目标不符；
  - `@retry` 包裹的 `call_llm` 重试的是**整个**调用（含熔断判断），熔断与重试相互嵌套、边界不清晰（`:144`）。
- 对 MatrixFlow `LLMService.ts` 的核验：`fallbackToRules=true` 时直接抛错，逻辑与注释相反（source-analysis.md:57），无 JSON/pydantic/熔断/重试，仅作思路参考。
- 统一采用单一 `LLMProvider` 抽象 + 显式 `LLMCallResult`（success/data/error）+ `tenacity` 重试在外层 + 熔断在内层，职责清晰、可 mock、可测试。
- 符合 AGENTS.md：不直接依赖第三方内部实现；`domain/`、`services/` 只依赖 `llm/` 接口。

## 验证方式

- `tests/unit/test_llm_gateway.py`：
  - text 模式返回原始文本；
  - JSON 模式返回 dict；
  - pydantic 校验成功返回模型实例；
  - JSON 解析失败 / pydantic 校验失败返回 `LLMCallResult(success=False)`；
  - 熔断在连续失败后 OPEN，OPEN 期间直接短路失败，恢复后重试成功；
  - 重试在临时失败后成功（retry 生效）。
- P2 DoD：LLM Gateway 至少对接 1 个提供商并通过 mock 测试；熔断/重试生效。

## 后果

- 正面：单一调用接口；可插拔多提供商（OpenAI 兼容端点 → DeepSeek 等）；失败显式可判；便于 P6 评测（记录调用序列）。
- 负面 / 风险：无 LLM 调用缓存（`cache.py`/`token_budget.py` 三线表未定，本阶段不实现）；真实提供商接入需 `.env` 密钥（不入库）。

## 参考代码

- MediaRadar：`llm_gateway.py`（`clean_json_string`、`LLMCallResult` 结构、`_call_llm_inner` 的 kwargs 组装）、`circuit_breaker.py`（`CircuitBreakerOpen`、OPEN/HALF_OPEN/CLOSED 状态机）。
- MatrixFlow：`LLMService.ts` 的 `call()` 顺序降级思路（本 ADR 不采用其实现）。
