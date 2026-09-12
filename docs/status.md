# SocialMediaAgent 项目状态

> 更新：2026-09-12
> 本文是项目**唯一进度来源**：现状、DoD 对照、未完成清单、续作步骤。
> 架构见 [`architecture.md`](architecture.md)；领域模型见 [`data-model.md`](data-model.md)；
> 合规边界见 [`compliance.md`](compliance.md)；工程规范见 [`../AGENTS.md`](../AGENTS.md)。

---

## 1. 一句话现状

后端 **P0 ~ P5.5 已完成并推送**；全量测试 **317 passed**（含 CI 门槛）；
**LLM 链路已用真实端点验证**；**`account_strategy` 的 gather 与最小图的指令路由均已支持 LLM 决策**（默认关闭，失败自动回退确定性路径）；
**Evaluation 已完成 M3（工具选择评测 + 多轮方差）**；前端尚未实施。

## 2. 基线

| 项 | 值 |
| --- | --- |
| 分支 / 远程 | `main` / Gitee |
| Python | 3.12（`app/backend/.venv`） |
| 测试 | `.venv/Scripts/python.exe -m pytest` -> 317 passed（`tmp_path` 需放宽沙箱权限，见 [`issues.md`](issues.md) 附录） |
| CI | `.github/workflows/ci.yml`（GitHub Actions）+ `app/scripts/run_ci.ps1`（本地门槛） |
| LLM | 可选；未配置 `LLM_API_KEY` 时全部走确定性规则兜底 |

## 3. 已完成阶段

| 阶段 | 交付 | 备注 |
| --- | --- | --- |
| P0 | 领域模型 + ORM + Normalizer 骨架 + VectorStore/Embedder 接口 + ADR 体系 | 完成 |
| P1 | MediaCrawler 采集链路（runner/reader/显式 schema）+ Normalizer + 幂等 Repository + IngestService + 查询 API + CLI | 完成；**真机验收未做** |
| P2 | LLM Gateway + RAG(FAISS) + Memory(独立库/TTL) + 9 个内部 Tool + LangGraph 最小图 | 完成 |
| P3 | Account Diagnosis Agent | 完成；P5.5.1 起并入 `account_strategy` |
| P4 | 5 个 Agent + Topic 数据层 + Memory 读-写闭环 + MCP/API | 完成 |
| P5 | API 文档化 + 周报/调度 + MCP Server + 自有账号 ADR-0004 | 完成；**适配器未实现** |
| P5.5 | 架构收敛：Agent 6 -> 3+2、Settings + .env、LLM 注入、RAG seed、Logging | 完成 |

## 4. 当前对外能力

- **HTTP**：5 个查询端点 + 6 个 Agent 端点（见 [`api.md`](api.md)）
- **MCP**：7 个工具（stdio）
- **CLI**：`import_csv`（手工导入真实数据，可用）、`ingest`（自动采集，阻塞）、`seed_knowledge`（知识库）

## 5. DoD 对照

### P0 — 全部达成

### P1（9 条）

| # | 条目 | 状态 |
| --- | --- | --- |
| 1 | 至少 1 个平台获取到真实数据 | **部分达成**：自动采集仍阻塞；已提供 `import_csv` 手工导入通道（真实数据，`source=manual` 可审计） |
| 2 | 数据进入采集中转、可审计 | **未达成**（依赖 crawler venv；手工通道不经中转库） |
| 3 | Normalizer 数值/时间/ID 断言通过 | 达成 |
| 4 | 数据进入统一领域模型并落核心库 | 达成 |
| 5 | Account / Content / Metric 可关联查询 | 达成 |
| 6 | canonical_id 可建立跨表关联 | 达成 |
| 7 | FastAPI 可查询 | 达成 |
| 8 | 有对应 unit + integration 测试 | 达成 |
| 9 | 采集流程可重复执行（幂等） | 达成 |

### P2（6 条）— 全部达成

### P3 — 输出 schema / 人类报告 / 统计可核验：达成；P1 真机数据端到端演示：**未达成**

### P4（3 条）— 全部达成（契约 + 回归 + 可组合调用）

### P5 — 调度与周报 / API 文档 / MCP Server：达成；自有账号接入：**未达成**

### P6 — 目标 5 项评估，已实现 **1 项**（工具选择质量，M3）；其余 4 项未开始

### P7 — 合规声明已完成；部署 / 架构图 / 演示脚本**未开始**

---

## 6. 已验证的真实性（重要）

**2026-09-12 真实 LLM 联调**（DeepSeek `deepseek-flash`，OpenAI 兼容端点）：

- `text` 与 `json + pydantic` 两种模式均通过。
- `POST /accounts/{id}/strategy`、`POST /titles/optimize` 走**真实 LLM**（日志 `llm_analyze: LLM 结构化输出成功`），非规则兜底。
- 输出确实引用数据库事实：2 条内容、话题 `post_count=88`、指标 12000 播放 / 640 赞 / 58 评论均出现在结果中。
- Memory 读-写闭环验证：第二次调用可读到 2 条历史策略。

**2026-09-12 最小图指令路由真实联调**（`agentic=True`，同一 DeepSeek 端点）：

- 「获取账号 `bilibili:70000001` 的资料」→ 模型选 `get_account_profile`，参数由模型补全（`account_id`）。
- **口语化指令**「帮我看看那个 UP主 `bilibili:70000001` 最近发了些什么」→ 模型选 `get_recent_contents`
  （`limit=10`）。该指令**正则路由不到**（有单测钉住这一前提），是 LLM 路由增量价值的直接证据。
- 「今天天气怎么样」→ 模型不选任何函数 → **回退正则** → 返回人类可读提示，**未崩溃**。

**验证边界**：

- Agent 端点的真实 LLM 覆盖：`/strategy`、`/contents/{id}/analysis`、`/titles/optimize` 均已验证；`/trends/analysis` 尚未。
- 评测范围：目前只有「工具选择质量」有指标；输出质量、RAG 检索质量、Prompt 回归尚未评测。
- 评测数据有**两条来源**：**合成演示数据**（`source=synthetic`，仅链路验证，不可作评测依据）与
  **真实公开数据**（19 条，`source=manual`，独立 real 库 `data/sma_real.db`）。**结论以真实数据那版为准**；
  每条真实数据的数字都能在原始视频页核验（CSV 带 `url` 出处）。合成数据由
  `seed/generate_demo_data.py` 生成、以 `--source synthetic` 导入独立 demo 库。
- 真实数据的导入通道：`import_csv`（见第 4 节）；采集方式与局限见 [`seed/README.md`](../app/backend/seed/README.md)。

---

## 7. 未完成清单（按优先级）

### A. 收尾

- [x] ~~M6 httpx2~~ —— 已核实为 `openai 3.x` 的**硬传递依赖**，非缺陷，无需处理。
- [x] CI（GitHub Actions + 本地 `run_ci.ps1`）
- [x] 根 README
- [x] `GET /accounts` 隐性 100 条截断（[`issues.md`](issues.md) #8 遗留）：端点显式暴露 `limit`（默认 100 / 最大 500），MCP `list_accounts` 同步；`/contents`、`/metrics` 本就有该参数
- [x] 死代码清理（已确认后执行）：删除 `normalizers/rules.py`（`install_default_rules` 无调用者，且 registry 对未注册平台本就回退 default，行为等价）与 `CircuitBreaker.to_dict()`（无调用者）。
      `normalizers/ids.py::canonical_id` **保留**——核实后它是 `normalizers` 包的公开导出且有测试覆盖，问题是「重复」而非「无引用」，删它会误删被测 API。
- [x] `Comment` 已删除（domain + ORM + `comments` 表 + 对应 domain 测试）——经确认后执行；该模型从未接入 Repository / API / 采集链路，`compliance.md` 的个人信息面同步缩小。

### B. AI 真实性

- [x] 真实 LLM 端到端
- [x] 手工数据导入通道：`cli/import_csv.py`（兼容 GBK、`--dry-run`、整体校验、`--source`）+ `seed/` 模板与说明
- [x] 合成演示数据通道：`seed/generate_demo_data.py` → **50 条内容 + 5 条话题** → 独立 demo 库（`source=synthetic`），仅用于链路验证与演示。
      话题经 `import_csv --topics` 导入（此前生成器不产出 Topic，导致 demo 库 `/trends/analysis` **恒为空结果**）
- [ ] P1.11 / 1.12 真机采集（`app/backend/.venv-crawler` 为空壳）
- [x] 填入真实数据：已入库 **19 条真实公开数据**（19 个账号 / 19 条内容 / 95 条指标，`source=manual`），落在**独立 real 库** `data/sma_real.db`（与 demo 库分离，且不入 git）。
      取数方式：**工具辅助阅读平台公开页面/接口 + 逐条核验**，每条保留 `url` 出处；**未提交任何采集脚本**（遵守 [`seed/README.md`](../app/backend/seed/README.md)「不要用自动化爬虫采集」）。
      样本局限：19 个账号**各 1 条**内容，不能支撑账号内趋势分析。

### C. AI 内核补强

- [x] **Account Strategy 的真实 Tool Calling**：新增 `agents/tool_loop.py`（通用 tool-calling 循环）、
      `llm/providers.py` 的 `ToolCallingProvider` / `complete_with_tools`、`account_strategy/agentic.py`。
      `agentic=True` 时由模型自主选择工具；失败/超步数**自动回退**确定性 gather；
      state 记录 `gather_source` 与 `tool_trace`（为 M3 的工具选择正确率铺路）。
      **实测观察**：真实 LLM 在健康账号上 6 个工具各调 1 次；在下滑账号上出现**重复调用**
      （recent_contents x2、search_operation_knowledge x2）—— 说明模型选择尚不精简，这正是 M3 要量化的点。
- [x] **`graph_builder.py` 的指令路由**（B1）：抽出 `agents/router.py`；`agentic=True` 时用 LLM function calling
      选路由与参数，异常/非唯一返回/参数不合法一律**回退正则**；state 记 `route_source`（llm/rules）与 `route_args`；
      拓扑改为条件分支（有路由 → `exec_tool`，无路由 → `no_route`）。**默认仍为正则且作为对照组**（有守护测试）。
      顺带修掉一个真实缺陷：规则路由到 `analyze_content_performance` / `get_content_metrics` 时原先不抽参数，
      `tool.invoke()` 必然抛 `ValidationError`。
- [x] **M3 工具选择评测**：`evaluation/`（指标 + runner + CLI + case 集）+ `RecordingRegistry` 实测调用序列。
      CLI 支持 `--runs N`（默认 3）：先按轮聚合、再跨轮给出 **均值 ± 总体标准差**；
      逐用例明细表保留每轮原始观测（可复核）。

      **实测（真实 LLM `deepseek-flash`，2 个合成演示账号，`--runs 3`）**：

      | 模式 | 重复取数 before | 重复取数 after | recall before -> after | 完全匹配率 before -> after |
      | --- | --- | --- | --- | --- |
      | rules | 3.00 ± 0.00 | **0.00 ± 0.00** | 1.000 -> 1.000 | 100% -> 100% |
      | llm | 0.33 ± 0.24 | 0.17 ± 0.24 | 0.972 ± 0.039 -> 1.000 ± 0.000 | 83% ± 24% -> 100% ± 0% |

      **结论**：评测发现确定性 gather 会重复取 profile / recent / trends（每例 3 次）——
      根因是它直接复用了 `topic_recommendation.gather()` 这个**完整能力**；修复后降为 **0**
      （见 [`issues.md`](issues.md) 第 11 条）。LLM 路径的重复调用属模型随机性，与本次改动无关。

      **方法论收获**：单轮运行会给出**看似精确的错误结论**——单跑一轮时 LLM 重复 0、完全匹配 100%；
      重复 3 轮后才看到完全匹配率仅 **83% ± 24%**。温度 > 0 的模型评测**必须报告方差**。

      **数据边界（重要）**：用例账号由 `seed/generate_demo_data.py` 生成，属 `source=synthetic`
      **合成演示数据**，按数据纪律**仅可用于链路验证**。其中确定性路径的调用次数与数据无关，
      可作为**代码行为结论**；而 LLM 的 recall / 完全匹配率**不可**据此下结论。

      **真实数据实测（同日，19 条真实公开数据，`--runs 3`）**：

      | 模式 | recall | precision | f1 | 完全匹配率 | 重复调用 |
      | --- | --- | --- | --- | --- | --- |
      | rules | 1.000 ± 0.000 | 1.000 ± 0.000 | 1.000 ± 0.000 | **100% ± 0%** | 0.00 ± 0.00 |
      | llm | 0.917 ± 0.000 | 1.000 ± 0.000 | 0.955 ± 0.000 | **50% ± 0%** | 0.00 ± 0.00 |

      **结论（对 LLM 不利，但这是真实结论）**：真实数据上**确定性路径 100% 完全匹配，LLM 路径只有 50%**——
      6 次 llm 运行中有 3 次稳定漏调 `search_operation_knowledge`。这为「`agentic` 默认关闭」
      提供了**实测依据**，而不是靠直觉。用例见 `evaluation/cases/account_strategy_real.json`。

      **口径警示（重要）**：这次 `llm` 的 `std` 全为 **0**，但逐用例看**并不稳定**——漏调在
      `real-gaogang` 与 `real-tongyi` 之间轮换，**每轮的用例均值恰好相同**（均为 11/12），跨轮标准差因此被抹平。
      **「std=0」不等于「稳定」**：当前汇总口径（先按轮求用例均值、再跨轮求标准差）会掩盖**轮内用例级抖动**；
      要判稳必须看逐用例明细，或补一个「逐用例跨轮稳定率」指标。
- [ ] RAG 语义嵌入：默认 `HashEmbedder` 不具备语义相似度（配置 `SMA_EMBEDDING_MODEL` 可切换）。

### D. P5 DoD 遗留

- [ ] 自有账号只读适配器 `connectors/matrixflow_ref/` + 测试（ADR-0004 已决策，实现待做）

### E. P6 Evaluation（需先完成 C）

- [ ] 5 项评估：数据准确性 / **Tool Calling 正确率（M3 已实现）** / RAG 检索质量 / Agent 输出质量 / Prompt 回归
- [x] `evaluation/` 模块（M3：工具选择指标 + runner + CLI + case 集；`--runs` 多轮方差）
- [ ] evaluation 在**真实数据**上重跑（当前用例为合成演示账号）+ 接入 CI 强制运行

### F. P7 打磨

- [ ] docker-compose 部署、架构图与演示脚本
- [x] 合规声明（见 [`compliance.md`](compliance.md)）

### G. 技术债（碎片级）

- [ ] MCP / API 的 `list_accounts` / `list_contents` 重复（两处直查 Repository）
- [ ] 平台代号映射两处重复（`connectors/mediacrawler/schemas.py` vs `normalizers/ids.py`）
- [ ] `build_memory_store()` 无 session 生命周期管理
- [ ] `graph_builder.py` 仍兼任能力派发（路由解析已在 B1 拆到 `agents/router.py`）；`trend_analysis` 的平台默认值仍硬编码 `bilibili`
- [x] **Alembic 迁移**：`migrations/`（基线 + 「删 comments」增量）、`alembic.ini`、`migrations/README`；
      新增 `database/migrations.py::upgrade_to_head`，生产入口（API 启动 / `import_csv` / `ingest`）改走迁移；
      **既有库自动收养**（stamp 基线再 upgrade）；模型-迁移漂移由 `tests/unit/test_migrations.py` 守护。
- [ ] Metric「最新快照」语义 vs 时间序列未定（影响趋势/历史分析真实性）
- [x] ~~`data/knowledge/*.index` 未被 `.gitignore` 覆盖~~ —— 已改为忽略整个 `app/backend/data/` 运行产物目录

### H. 前端（规划就绪，未实施）

- [ ] 见 [`plan-frontend.md`](plan-frontend.md)；建议先补后端 3 个小改动（`GET /reports`、`GET /system/status`、响应加 `source: llm|rules`）

---

## 8. 已知阻塞与风险

| 项 | 说明 |
| --- | --- |
| crawler venv 为空壳 | 阻塞自动采集 P1.11/1.12；真实数据改走 `import_csv` 手工导入 |
| RAG 默认非语义 | `HashEmbedder` 检索质量有限 |
| 工具 / 路由决策 | `account_strategy` 的 gather 与最小图的指令路由均已支持 LLM 决策（**默认关闭**、失败回退确定性路径）。工具选择质量已有评测（M3），但**用例仍为合成演示账号**，LLM 侧结论需真实数据 |
| 无认证 / 无多租户 | 当前定位为**单用户本地工具**，不适用于多用户或企业场景 |
| 合规 | 采集通道涉及平台 ToS 与非商用许可，见 [`compliance.md`](compliance.md) |

---

## 9. 推荐续作步骤

1. ~~C 组 Tool Calling~~ / ~~A 组死代码清理~~ —— **均已完成**（见第 7 节 C 组与 A 组）。
2. **填入真实数据（约 30 条）** —— 用 `import_csv` 手工导入；自动采集可改走官方 API / 自有账号只读适配器（更合规，见 ADR-0004）。
   **这是当前唯一卡住「评测结论可信度」的事**：LLM 侧数字目前都长在合成演示账号上。
3. **E 组 Evaluation 剩余维度**（RAG 检索质量 / 输出质量 / Prompt 回归）+ 接入 CI 强制门槛；可选：路由正确率评测（B2）。
4. **F 组部署与演示**（docker-compose / 架构图 / 演示脚本）。
5. **H 前端**（可选）。

> 严格遵循 [`AGENTS.md`](../AGENTS.md)：每次一个小任务 -> 先写测试（TDD）-> 跑测试 -> `git diff` -> commit + push。

---

## 10. 常用命令

见根 [`README.md`](../README.md) 的「快速开始」与「测试」两节（环境、配置、启动 API、MCP、CLI、测试命令）。
