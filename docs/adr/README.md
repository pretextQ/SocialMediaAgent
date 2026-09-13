# ADR 体系与第三方模块三线表（初稿）

> 目的：对第三方项目（MatrixFlow / MediaCrawler / MediaRadar 仅研究参考）的每个"移植候选"模块，
> 在进入对应阶段前必须走一次 ADR 决策：**参考 / Adapter 封装 / 重新实现 / 不采用**。
> 本表为 P0.9 初稿（基于 `docs/source-analysis.md` 的已核验源码事实）。
> **结论以各阶段正式 ADR 为准**，本表仅作预判与检索入口。
> **P4 补充（2026-08-24）**：趋势分析 / 选题推荐在 P4 为**新增实现**（基于自建 Topic 数据层与 RAG，见 `agents/trend_analysis/`、`agents/topic_recommendation/`），MatrixFlow 无对应模块，不涉及移植候选，无需额外 ADR。
> **P5 补充（2026-08-24）**：自有账号数据接入经 **ADR-0004** 决策——浏览器自动化路径（登录态/发布/反检测）不采用；自有账号只读数据以平台官方能力优先 + Python 重写适配器，纳入 `PlatformConnector` 边界（`connectors/matrixflow_ref/`），发布写操作另行评估。
> **P7 补充（2026-09-13）**：前端经 **ADR-0005** 决策——矩阵流（MatrixFlow）Electron 渲染层与发布 UI **不采用**；前端在 `app/frontend/` **重新实现**（Vite + React + TS + Tailwind），**只经 HTTP** 接入，不做写操作。Jinja2 / Streamlit 作为备选方案一并评估后不采用。

## 决策口径

| 决策 | 含义 |
|---|---|
| 参考 | 借鉴设计思路，不复制代码 |
| Adapter 封装 | 第三方能力经 Connector/Adapter 接入，核心业务不直接依赖其内部 |
| 重新实现 | 在 `app/` 内以 Python 按需重写 |
| 不采用 | 明确不用（含合规/质量/与架构冲突） |

## 一、MatrixFlow-main 模块三线表（初判）

| 模块 | 关键引用（已核验） | 初判 | 归属阶段 | 备注 |
|---|---|---|---|---|
| 平台适配器接口 + 注册中心 | `electron/platform/base/interfaces.ts`（PlatformAdapter）、`base/PlatformRegistry.ts`、`platform/adapter.ts: registerAllAdapters()` | 参考 | P5（自有账号接入） | 接口形态值得借鉴；Python 重写 |
| selectors 集中化 + 失效检测 | `platform/<p>/selectors.ts`、`index.ts: detectPageChanges()` | 参考 | P5 | DOM 维护成本集中化思路 |
| SQL 迁移系统 | `electron/data/Database.ts: runMigrations()` | 参考 | 已采用 | 我们用 SQLAlchemy + Alembic，不移植其实现 |
| Repository 模式 | `data/repositories/BaseRepository.ts` | 参考 | 已采用 | P0.5 已实现同构 |
| 任务状态机 + 最小堆队列 | `core/TaskScheduler.ts`、`core/QueueManager.ts` | 参考 | P5 Scheduler | 8 态 + 持久化恢复思路 |
| RateLimiter 并发+滑窗 | `core/RateLimiter.ts: acquire()/getWaitTime()` | 参考 | P1 采集限流 | 按平台粒度 |
| AI 规则兜底 | `ai/AIService.ts: ruleBasedPrePublishCheck()` | 参考 | P3 | LLM 失败降级确定性规则（ADR-0003 已确认：规则兜底实现） |
| 异常检测 | `services/AnomalyService.ts`（report/getActiveAlerts）、`ai/AIService.ts: detectAnomaly()`（:250 映射表） | 不采用（逻辑重新实现） | P3 | 纯 severity/action 映射、不计算指标；改由 LLM 基于 DB 事实识别 + 规则兜底（ADR-0003 已确认） |
| LLM 多提供商 + 降级 | `ai/LLMService.ts: call()/callProvider()` | 重新实现 | P2 llm_gateway | 无 JSON 模式/熔断/重试；`fallbackToRules` 分支有 bug |
| Stats 分层聚合 | `services/StatsService.ts`（fetchVideoStats/fetchPlatformStats/getOverviewStats） | 重新实现（已确认） | P1/P3/P4 | 已实现：`analyze_content_performance` + 各 Agent 规则聚合（Content Analysis 质量分 / Trend 趋势分 / Strategy 分档策略），在统一模型+数值化指标上重写 |
| MCP 工具命名与校验 | `mcp-server/index.ts`（18 tools、handleToolCall） | 参考 | P5 | 命名/校验模式参考，不复制 bridge 直连 SQLite |
| AICache | `ai/AICache.ts`（内存 Map + 按 hits 淘汰） | 不采用 | - | 实为 LFU、注释与实现不符、无持久化 |
| Electron 层 | `electron/main.ts`、`preload.ts`、`ipc/handlers.ts` | 不采用 | - | 桌面壳强耦合 |
| 浏览器自动化发布/反检测 | 各平台 `login/upload/publish`、`embedded-browser/stealth-engine.ts` | 不采用（已确认，ADR-0004） | - | ToS/合规风险；Python 侧需另做评估 |
| License 体系 | `services/LicenseService.ts`、`core/SignatureVerifier.ts` | 不采用 | - | 商业授权模型 |
| Sentry | `core/SentryInit.ts` | 不采用 | - | 需 DSN/账号 |
| 机器指纹加密 + 明文 Cookie | `core/CryptoService.ts: deriveKey()`、`services/session-manager.ts: writeStorageState()` | 不采用（已确认，ADR-0004） | - | 声称加密与实现不符 |
| 废弃目录 | `electron/browser/`、`electron/scheduler/`、`src/douyin/`、`src/stores/` | 不采用 | - | 官方明令禁用 |

## 二、MediaCrawler 模块三线表（初判）

| 模块 | 关键引用（已核验） | 初判 | 归属阶段 | 备注 |
|---|---|---|---|---|
| 平台 API 客户端业务方法 | `media_platform/<p>/client.py`（search_*/get_*_info/get_*_comments） | Adapter 封装 | P1 MediaCrawlerConnector | 稳定接口，经 runner/reader 接入 |
| 登录态管理 | `media_platform/<p>/login.py`（login_by_qrcode 等） | Adapter 封装 | P1 | 子进程模式自动隔离 |
| 代理池 | `proxy/proxy_ip_pool.py: ProxyIpPool`、`proxy_mixin.py: ProxyRefreshMixin` | Adapter 封装 | P1 | 采集侧使用 |
| 存储 Store/DAO | `store/<p>/__init__.py: *StoreFactory`、`store/<p>/_store_impl.py` | 不直接依赖 | P1 | 绕过，自建统一模型入库 |
| 动态列名探测 | `store/excel_store_base.py`、`tools/async_file_writer.py` | 不采用 | - | 首个数据决定 schema |
| 平台签名黑盒 | `xhs/xhs_sign.py`、`playwright_sign.py`、`bilibili/help.py: BilibiliSign`、`libs/douyin.js`、`libs/zhihu.js` | 不采用 | - | 随风控频繁变，留在采集侧 |
| GraphQL | `kuaishou/graphql.py` + `.graphql` | 不采用 | - | 采集侧内部 |
| WebUI（api/） | `api/main.py`、`api/services/crawler_manager.py: CrawlerManager` | Adapter 封装 | P1（可选） | 无鉴权，仅内网；仅借鉴子进程编排思路 |
| 全局可变 config / ContextVar | `config/base_config.py`、`var.py` | 不采用 | - | 并发不安全；子进程隔离规避 |

## 三、MediaRadar-main 模块（仅研究参考，不进依赖，初判）

| 模块 | 关键引用（已核验） | 初判 | 归属阶段 | 备注 |
|---|---|---|---|---|
| LangGraph 分析子图 | `backend/services/radar_service/analysis_graph.py`（analyst→reviewer→director） | 参考 | P3 | Agent 图结构范式 |
| LLM 网关 | `radar_service/llm_gateway.py`、`core/circuit_breaker.py` | 重新实现 | P2 | 借鉴熔断/重试/pydantic 校验思路 |
| Qdrant 向量库 | `radar_service/vector_store.py` | 参考 | P2 | 已定 FAISS 接口，替换存储层 |
| Agent 记忆/反思 | `agent_service/memory/`、`agent_service/reflection/` | 参考 | P2/P3 | Memory 设计参考 |
| 推送 notifier | `radar_service/notifier/` | 参考 | P5（可选） | 报告/告警推送 |

## 四、P7 复评补充（2026-09-13，前端落地后再次勘探）

> 背景：ADR-0005（前端）落地后重新通读两个参考项目，寻找本表前三节**未覆盖**的模块。
> 下表为本次新识别的候选；**已采纳**的注明落地位置。

### 4.1 已采纳（本次）

| 候选 | 关键引用（已核验） | 决策 | 落地位置 |
|---|---|---|---|
| 角色级模型配置（默认模型 + 每角色独立） | MediaRadar `core/model_config_db.py`、`subscription_service/api.py` | 重新实现 | `config.py` 的 `llm_model_*` 字段与 `model_for()`；`llm/factory.py::build_gateway(role=...)`；`api/deps.py::get_gateway` |
| 熔断器状态可观测 | MediaRadar `core/circuit_breaker.py` + `/api/circuit/states` | 重新实现（只读展示） | `GET /system/status` 新增 `llm_circuit_state` / `llm_circuit_failures` |
| 周报环比 | MatrixFlow `services/WeeklyReportService.ts: calculateTrendPercent()` | 重新实现 | `services/weekly_report.py` 的 `_change_pct` / `_format_pct` 与「环比」小节 |
| 时间序列观测表（快照之外的历史） | 无第三方来源（本项目内部决策，产出 **ADR-0006**） | 重新实现 | `domain/observation.py`、`models/observation.py`、`repositories/observation_repo.py`、观测表迁移、`import_csv` 写入接线 + `--observed-at` |

### 4.2 待评估（未动工）

| 候选 | 关键引用（已核验） | 初判 | 前置条件 |
|---|---|---|---|
| 三角色评审图 analyst→reviewer→director | MediaRadar `radar_service/analysis_graph.py`（`reviewer_node`、`route_after_reviewer`） | 参考 | 需先小样本跑 `evaluation/quality_runner` 验证是否真提升；评委与被测同端点，存在自偏好 |
| 话题演变时间线 | MediaRadar `radar_service/topic_tracker.py`（`build_evolution_timeline` / `get_topic_history` / `_upsert_topic_point`） | **已部分采纳** | ✅ ADR-0006 落地观测表；趋势分析已消费（`direction` / `change_pct`）。**未做**：独立的演变时间线查询视图（多点序列 + 时间轴） |
| 周报 / 告警多通道投递 | MediaRadar `radar_service/notifier/`（`base.py` + `registry.py` + email/wecom/feishu/rss） | 参考 | 需先决定是否引入网络出口与凭证；应默认关闭、缺配置不启用 |
| 持久化任务队列 | MatrixFlow `core/TaskScheduler.ts` + `QueueManager.ts` | 暂不采用 | 本地单进程工具，APScheduler + 磁盘产物够用 |

### 4.3 明确不采用（本次复评再次确认）

| 候选 | 理由 |
|---|---|
| `core/auth_jwt.py` / `login_lockout.py` / `quota_db.py` / `subscription_db.py` / `security_middleware.py` | 多租户 SaaS 机制；与「单用户本地工具」定位冲突，且要动核心数据模型（须先走 ADR） |
| `radar_service/embed_cluster.py`（HDBSCAN 聚类） | 需语义嵌入 + 新依赖；默认 `HashEmbedder` 是字符哈希，聚类无意义（应先解决 RAG 语义化） |
| `radar_service/vision_agent.py`（Qwen-VL 封面解析） | 引入视觉模型与新成本面，非当前能力主线 |
| `radar_service/push_generator.py`（48KB HTML 邮件模板） | 本项目报告是 markdown，无 HTML 邮件场景 |
| `gateway/main.py`、`radar_service/db_manager.py` | 他们的网关与 DB 层；本项目已有 FastAPI + SQLAlchemy + Alembic |
| MatrixFlow `Watchdog.ts` / `FailureCoordinator.ts` / `BrowserPool.ts` | 服务于浏览器常驻进程池；本项目无浏览器运行时（采集走独立子进程） |
| MediaRadar `core/sanitize.py` | 解决 HTML / 邮件通道的 XSS；本项目前端用 `react-markdown`（默认不渲染裸 HTML），**该风险不存在**。真正缺的是**提示注入防护**（不可信采集内容进 prompt），属另一议题 |

## 五、用法说明

1. 进入某个阶段（如 P2 实现 llm_gateway）前，先为本表对应行生成正式 ADR（复制 `template.md`），落盘为 `docs/adr/NNNN-*.md`，更新状态。
2. 若实际源码与 `docs/source-analysis.md` 不一致，以源码为准并记录差异。
3. 三线表随开发持续维护，结论被阶段 ADR 确认后在本表标注"已确认"。
4. ADR 编号从 `0002` 起（`0001` 未落盘）；新增 ADR 请顺延编号，并同步更新本表的「已确认」标注。
