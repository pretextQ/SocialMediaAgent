# SocialMediaAgent 源码分析报告（MatrixFlow + MediaCrawler）

> 分析方式：纯只读，实际阅读与搜索源码；所有引用均经核对。关键结论已二次抽查验证。
> 地位：本文是**第三方源码事实的权威来源**，被 `docs/adr/` 直接引用；`docs/architecture.md` 只描述自研架构，不重复第三方细节。
> 说明：物理路径上不存在 `third_party/MediaCrawler-main/`，MediaCrawler 源码位于 `third_party/MediaRadar-main/backend/services/crawler_service/`（下文简写为 `crawler_service/`）。

---

## 一、MatrixFlow-main 源码分析

**分析根目录**：`third_party/MatrixFlow-main/`

### 1. 项目入口

- `electron/main.ts` — `app.whenReady()` 内按序初始化：`initDatabase()` → `ConfigManager.getInstance().initialize()` → `securityLayer.initialize()` → `browserPool.initialize()` → `taskScheduler.start()` → `publishService.initialize()` → `selectorUpdateService.initialize()` → `registerAllAdapters()` → `accountService.initialize()` → `registerIpcHandlers()`。`createWindow()`（:48）创建 BrowserWindow，`contextIsolation:true, sandbox:true`。
- `electron/preload.ts` — `contextBridge.exposeInMainWorld('matrixflow', api)`（:502），所有渲染进程调用经 `ipcRenderer.invoke`；回推事件受 `ALLOWED_CHANNELS`（:16-39）白名单限制。
- `electron/ipc/handlers.ts` — `CHANNEL` 常量集中声明 `{domain}:{action}` 通道；`registerIpcHandlers()`（:310）注册约 140 个 `ipcMain.handle`。**注意：部分 handler 直接 `getDatabase().prepare(...)` 裸 SQL**（如 `accounts:list`、`settings:get`），并非全部走 Repository。
- `electron/services/ipc-handlers.ts` — `registerAccountLoginHandlers()`（:137）处理扫码登录，回调写 accounts 表。
- 渲染层 `src/renderer/main.ts` — 纯 UI，无 Node 访问。

### 2. 整体架构

- 四层：`renderer(Vue3) → preload(contextBridge) → main process {services/core/platform/ai/data} → 外部依赖(Patchright/SQLite/LLM)`。
- 注册中心：`electron/platform/base/PlatformRegistry.ts`（`PlatformRegistryClass`，`Map<platformId, PlatformAdapter>`）；`platform/adapter.ts: registerAllAdapters()` 注册 5 平台。
- 服务多为模块级单例（`StatsService.getInstance()`）。
- 依赖方向：services→core（单向）；官方 AGENTS.md 明令 core 不得依赖 services。

### 3/4/5. 数据获取方式与平台

- **支持平台**：douyin / xiaohongshu / channels(视频号) / kuaishou / bilibili（`platform/adapter.ts: PLATFORM_IDS`）。
- **获取方式 = 浏览器自动化**。以 bilibili 为例：
  - `electron/platform/bilibili/stats.ts: fetchStats(accountId, period)`（:23）：读 `userData/cookies/bilibili/{accountId}.json` → `chromium.launch({headless:false})` + `newContext({storageState})` 注入登录态 → `goto(statsOverview)` → `extractOverviewStats(page, period)`（:109）按 `STATS_SELECTORS.statCard` 文案关键词分类 → `extractNumber()`（:143）解析 `[\d.]+[万kw]?`（万×10000）。
  - `selectors.ts` 集中管理 `BILIBILI_URLS/LOGIN_SELECTORS/UPLOAD_SELECTORS/STATS_SELECTORS`；`BilibiliAdapter.detectPageChanges(page)`（index.ts:72）探测失效并交 `SelectorUpdateService`。
  - `cookie.ts: getCookiePath()` 按账号隔离路径；`session-manager.ts: writeStorageState()` 以 **JSON 明文**写文件。
- **结论**：MatrixFlow 的"数据获取"本质是**自有账号的发布与后台统计抓取**，不含公开内容搜索/采集。

### 6. 数据模型

- 迁移：`electron/data/migrations/001-017.sql`（WAL + `foreign_keys=ON`）。
- 核心表：`accounts`、`videos`、`publish_records`、`stats`(旧)、`video_stats`(新)、`tasks`、`publish_tasks`、`task_items`、`contents`、`drafts`、`groups`、`group_publish_rules`、`proxies`、`fingerprint_templates`、`platform_configs`、`monitor_plans`、`weekly_reports`、`comment_templates`、`comment_tasks`、`license`、`panel_sessions`、`materials`、`account_publish_presets`。
- 类型：`electron/data/types.ts`（snake_case 对齐表）；`electron/services/types/stats.ts`（`VideoStats/AccountStats/PlatformStats/OverviewStats/TrendData/IStatsService`）。
- 访问模式：`electron/data/repositories/BaseRepository.ts` 泛型 CRUD（`findById/insert/update/deleteWhere/...`），子类如 `VideoStatRepository`（`getLatestByPlatformVideoId`/`getStatsHistory`）。

### 7. Stats / Analytics

- `electron/services/StatsService.ts`（单例）：
  - 内存缓存（`videoStatsCache/accountStatsCache/platformStatsCache/overviewCache`，TTL 5 分钟 `DEFAULT_CACHE_TTL_MS`）。
  - `fetchVideoStats(videoId, platform)`（:89）：缓存→`adapter.fetchVideoStats()`→`persistVideoStat()`→`eventBus.emit(StatsEvent.VIDEO_STATS_UPDATED)`；`fetchBatchVideoStats()`（:127）并发 3；`fetchAccountStats()`（:177）；`fetchPlatformStats()`（:226，SQL SUM/COUNT）；`getOverviewStats()`（:271）；`getTrendData(metric)`（:335，`sanitizeMetricColumn()` 白名单后按 `DATE(fetch_time)` 分组）。
  - 指标维度：`play/like/comment/share/collect`。
- `AnomalyService.ts`（单例）：`report()`→`AIService.detectAnomaly()`，**纯 severity/action 映射，不计算指标**；`getActiveAlerts()`（:69）。
- `WeeklyReportService.ts`：`generateReport()`（:60）→`calculateSummary/calculateTrends/getTopPerformingContent/getPlatformBreakdown/generateInsights`；**数据关联靠 `task_items.published_url LIKE '%'+platform_video_id+'%'` 字符串匹配**；`getAIInsights()`（:325）访问 `aiService['llm'].call()`（私有字段，脆弱）。
- `MonitorService.ts`：`startMonitor`（:155，setInterval）；`checkPlan`（:180）经 `metricToColumn` 白名单映射后比较阈值；`triggerAlert`（:238）。

### 8. AI / Agent

- `electron/ai/LLMService.ts`：`call()`（:56）先调默认 provider，失败时**按 providers 顺序降级**（:77-90）；`callProvider()`（:96）是 OpenAI 兼容 `fetch('/chat/completions')`（qwen 特殊加 `qwen-` 前缀）；`PROVIDER_DEFAULTS` 含 openai/deepseek/qwen/anthropic。**无 JSON 模式、无 pydantic 校验、无熔断、无重试**。
- `electron/ai/AIService.ts`：`prePublishCheck()`（:49，LLM 失败→`ruleBasedPrePublishCheck` 兜底）；`optimizeRule()`（:164，LLM+规则版）；`detectAnomaly()`（:250，映射表）；`matchContentToGroup()`（:284）；`trackCost()`（:411，硬编码价格表）。
- **重要事实**：`LLMService.call()` 中 `fallbackToRules` 逻辑存在反直觉分支（fallbackToRules=true 时反而直接抛错，:72-74），疑似 bug，复用需谨慎。

### 9. RAG

**结论：不存在。** 无向量库依赖、无 Embedding、无 FAISS/Qdrant/vector store。AIService 的"知识"只有 prompt 内硬编码规则与历史记录聚合。

### 10. Memory

**结论：不存在 Memory 系统。** 唯一"记忆"形态是 `video_stats/weekly_reports/monitor_plans` 结构化历史表 + AIService 的规则计算。`src/memory-monitor.ts` 是进程 RSS 内存监控，与记忆无关。`AICache.ts` 为内存 `Map` + TTL + 淘汰（**按 hits 最少驱逐，实为 LFU**），注释声称"内存+SQLite 持久化"与实现不符（无任何 DB 写入）。

### 11. MCP

- `mcp-server/index.ts`：18 个 tool（`account_list/account_status/account_add/account_remove`、`content_list/content_upload/content_delete/content_search/content_tags`、`publish_create/publish_list/publish_cancel/publish_status/publish_schedule/publish_batch`、`stats_overview/stats_platform/stats_trend`）；`handleToolCall`（:422）做参数校验；stdio 传输。
- `mcp-server/src/bridge.ts`：`getBridge()`（:656）**无条件返回 `StandaloneBridge`**（注释承认未真正实现 IPC 模式）；`StandaloneBridge` 直接 `new Database()` 打开 `matrixflow.db`，`route()`（:228）转成直接 SQL；其 `ensureSchema()` 自建了一套**与主应用真实 schema 不一致**的简化表结构，直接读真实库存在列不匹配风险。

### 12. Scheduler

- `electron/core/TaskScheduler.ts`（单例）：8 态状态机（`queued→pending→uploading→publishing→audit→success`，失败→`failed`）；`schedule()/scheduleAt()/schedulePeriodic()`；`start()`（:209）恢复队列；`tick()`（:283）1s 轮询 + `rateLimiter.acquire()`；**`handleFailure` 只标记 failed，不自动重试**（指数退避重试在平台层 `BaseAdapter.retryWithBackoff()`）。
- `electron/core/QueueManager.ts`：自实现**最小堆**优先队列；`persist()`（:250）每 5s `INSERT OR REPLACE` 写 `tasks` 表；`restore()`（:310）开机恢复。
- `electron/core/RateLimiter.ts`：每 key 一个 `BucketState`（并发数 + 固定滑窗），`acquire()`/`getWaitTime()`。

### 13. 值得参考的设计

1. **平台适配器接口 + 注册中心**：`platform/base/interfaces.ts`（`PlatformAdapter` 组合接口）+ `PlatformRegistry` + `registerAllAdapters()` — 新增平台只需实现同组方法。
2. **selectors 集中化 + 失效探测**：`selectors.ts` + `detectPageChanges()` — DOM 维护成本集中。
3. **SQL 迁移系统**：`data/Database.ts runMigrations()` + 有序 `migrations/*.sql` + `migrations` 表。
4. **Repository 模式**：`BaseRepository` 泛型 CRUD 屏蔽 SQL。
5. **任务状态机 + 最小堆队列 + SQLite 持久化/恢复**：`TaskScheduler`/`QueueManager`。
6. **RateLimiter 并发+滑窗双限流**（按 `{platform}:{accountId}` 粒度）。
7. **AI 规则兜底（fallback）**：LLM 失败/未启用降级规则引擎。
8. **LLM 多提供商 + 顺序降级**：`LLMService.call()`。
9. **Stats 分层聚合 + TTL 缓存 + 事件解耦**：`StatsService`。
10. **MCP 独立包 + stdio + 枚举/必填校验**：`mcp-server/index.ts`（工具名可作为未来 MCP 的命名参考）。
11. **IPC 通道 `{domain}:{action}` + preload 白名单**：主进程 API 面清晰的模式。

### 14. 不应直接复用

1. **Electron 专属层**：`main.ts/preload.ts/ipc/*`、`BrowserWindow/WebContentsView` — 强耦合桌面壳。
2. **废弃重复目录**：`electron/browser/`、`electron/scheduler/`、`src/douyin/`、`src/stores/`（官方 AGENTS.md 明令禁用）。
3. **浏览器自动化发布/登录/反检测**：各平台 `selectors/login/upload/publish`、`stealth-engine.ts`、指纹伪造 — DOM 时效性差 + ToS/合规风险。
4. **License 体系**：`LicenseService/LicenseServerClient/SignatureVerifier/selector-public-key.ts` — 商业授权模型。
5. **Sentry 集成**：`core/SentryInit.ts`。
6. **机器指纹派生密钥 + 明文 Cookie**：`CryptoService.deriveKey()`（scrypt 指纹）、Cookie 实际明文存储 — 不可移植且不满足"加密"宣称。
7. **AICache 的"LRU"实现**：实为 LFU 且无持久化。
8. **MCP StandaloneBridge 自建 schema**：与真实库不一致，直连会写坏数据。
9. **硬编码 LLM 价格表 / `published_url LIKE` 字符串关联统计**：易错、易过时。
10. **`ipc/handlers.ts` 裸 SQL**：绕过 Repository 的反模式。
11. **`LLMService.call()` 的 fallback 分支 bug**：逻辑与注释相悖。

---

## 二、MediaCrawler 源码分析

**分析根目录**：`third_party/MediaRadar-main/backend/services/crawler_service/`（下称 `crawler_service/`）

### 1. 项目入口

- `crawler_service/main.py: main()`：`cmd_arg.parse_cmd()` →（可选 `db.init_db()` 建表）→ `CrawlerFactory.create_crawler(config.PLATFORM)` → `crawler.start()` → 按存储方式 flush。
- `crawler_service/cmd_arg/arg.py: parse_cmd()`：typer CLI，参数含 `--platform/--lt/--type/--keywords/--get_comment/--headless/--save_data_option/--init_db/--cookies/--specified_id/--creator_id/--max_comments_count_singlenotes/--max_concurrency_num/--save_data_path/--enable_ip_proxy/--ip_proxy_provider_name`。
- `crawler_service/config/__init__.py` + `base_config.py`：**全局可变模块属性**（`config.PLATFORM`、`SAVE_DATA_OPTION` 等），CLI 运行时改写模块级状态。
- 枚举：`PlatformEnum(xhs/dy/ks/bili/wb/tieba/zhihu)`、`CrawlerTypeEnum(search/detail/creator)`、`SaveDataOptionEnum(csv/db/json/jsonl/sqlite/mongodb/excel/postgres)`。

### 2. Crawler 架构

- `base/base_crawler.py`：`AbstractCrawler(start/search/launch_browser)`、`AbstractLogin(begin/login_by_qrcode/login_by_mobile/login_by_cookies)`、`AbstractStore(store_content/store_comment/store_creator)`、`AbstractStoreImage/AbstractStoreVideo`、`AbstractApiClient(request/update_cookies)`。
- 每平台目录 `media_platform/<platform>/`：`core.py`（Crawler 类，如 `BilibiliCrawler`）、`client.py`（API 客户端，如 `BilibiliClient(AbstractApiClient, ProxyRefreshMixin)`）、`field.py`（枚举）、`login.py`、`help.py`（URL 解析/签名）、`exception.py`。

### 3. 支持平台

`main.py: CrawlerFactory.CRAWLERS`：`xhs→XiaoHongShuCrawler`、`dy→DouYinCrawler`、`ks→KuaishouCrawler`、`bili→BilibiliCrawler`、`wb→WeiboCrawler`、`tieba→TieBaCrawler`、`zhihu→ZhihuCrawler`。

### 4. 数据采集流程（bilibili 示例）

`media_platform/bilibili/core.py`：`BilibiliCrawler.start()` →（代理池/CDP 浏览器/`BilibiliClient`）→ `pong()` 校验登录 → `search()` → `client.search_video_by_keyword()`（**WBI 签名** `/x/web-interface/wbi/search/type`）→ `get_video_info_task(aid,bvid)` → `client.get_video_info()`（`/x/web-interface/view/detail`）→ `store/bilibili/__init__.py: update_bilibili_video()/update_up_info()` → `batch_get_video_comments()` → `client.get_video_all_comments(..., callback=...)` 逐条 `update_bilibili_video_comment()`；二级评论走 `get_video_all_level_two_comments()`。detail/creator 模式同理（`get_specified_videos`/`get_all_creator_details`）。

### 5. 数据模型

- `model/m_*.py`：Pydantic 模型**仅用于 URL 解析**（如 `m_bilibili.VideoUrlInfo`、`m_xiaohongshu.NoteUrlInfo`），采集数据本身以 **Dict** 传递。
- `database/models.py`：SQLAlchemy `declarative_base`，**21 张表**：`bilibili_video/bilibili_video_comment/bilibili_up_info/bilibili_contact_info/bilibili_up_dynamic`、`douyin_aweme/douyin_aweme_comment/dy_creator`、`kuaishou_video/kuaishou_video_comment`、`weibo_note/weibo_note_comment/weibo_creator`、`xhs_creator/xhs_note/xhs_note_comment`、`tieba_note/tieba_comment/tieba_creator`、`zhihu_content/zhihu_comment/zhihu_creator`。
- **字段口径不统一**：如 `bilibili_video.video_play_count` 是 Text 存 `str(stat)`，douyin 同理；ID 类型混用 BigInteger/Text（`aweme_id` vs `video_id` vs `note_id`）。

### 6. SQLite 数据结构

- `config/db_config.py`：`SQLITE_DB_PATH` 由文件位置向上 4 级 + `data/sqlite_tables.db`，即 **`backend/data/sqlite_tables.db`**（与 CWD 无关）。
- `database/db_session.py`：`get_async_engine()` 按 db_type 建 engine（`sqlite+aiosqlite:///...`、`mysql+asyncmy://...`）；`create_tables()` 用 `Base.metadata.create_all`；`get_session()` 每请求一个 AsyncSession。
- `database/db.py`：`init_db()`/`close()`。

### 7. Store / DAO 架构

- factory 在各平台 store 包内：`store/bilibili/__init__.py: BiliStoreFactory.STORES`（csv/db/postgres/json/jsonl/sqlite/mongodb/excel）+ `create_store()`；实现类 `store/<platform>/_store_impl.py`（如 `BiliSqliteStoreImplement`）。
- **写入粒度：逐条（per-item）**，DB 实现每条 `select → setattr → add → commit`。
- **数据以 Dict 动态映射**：`update_bilibili_video(video_item: Dict)` 内部按 dict key 组装列值，`liked_count=str(...)` 强转字符串。
- 媒体落盘：`store/<platform>/*_store_media.py`（如 `store/bilibili/bilibilli_store_media.py: BilibiliVideo`）。
- `store/excel_store_base.py`、`store/mongodb_store_base.py`、`tools/async_file_writer.py`（json/jsonl/csv）。

### 8. 数据最终保存在哪里（默认）

- **SQLite（默认 `SAVE_DATA_OPTION="sqlite"`）**：`backend/data/sqlite_tables.db`（需先 `--init_db sqlite`）。
- json/jsonl/csv：`{CWD}/data/{platform}/{type}/{crawler_type}_{item_type}_{YYYY-MM-DD}.{ext}`。
- excel：`data/{platform}/{platform}_{crawler_type}_{YYYYMMDD_HHMMSS}.xlsx`。
- 媒体：`data/bili/videos/{aid}/video.mp4` 等。
- 登录态：`{CWD}/browser_data/{platform}_user_data_dir`。

### 9. 如何启动采集任务

- **CLI**：`python main.py --platform bili --type search --keywords "..." --save_data_option sqlite --init_db sqlite`（detail/creator 模式用 `--specified_id`/`--creator_id`）。
- **HTTP（仅内网 WebUI）**：`api/main.py`（FastAPI 8080，**无鉴权/无网关**，文件头注释声明仅供内网）；`api/services/crawler_manager.py: CrawlerManager.start()` 用 `_build_command()` + `subprocess.Popen` 起子进程，`stop()` 发 SIGTERM。

### 10. 可通过 Adapter 接入 SocialMediaAgent 的能力

以各平台 `client.py` 公开业务方法为稳定接口（均已确认存在）：

| 能力 | 引用 |
|---|---|
| 关键词搜索 | `media_platform/bilibili/client.py: BilibiliClient.search_video_by_keyword()`；xhs `get_note_by_keyword()`；dy `search_info_by_keyword()`；wb/tieba/zhihu 各有 `search_*_by_keyword()` |
| 内容详情 | `BilibiliClient.get_video_info()`、`XiaoHongShuClient.get_note_by_id()`、`DouYinClient.get_aweme_detail()`、`KuaishouClient.get_photo_detail()` 等 |
| 评论 | `BilibiliClient.get_video_all_comments()/get_video_all_level_two_comments()`、`XiaoHongShuClient.get_note_all_comments()` 等 |
| 用户/粉丝/动态 | `BilibiliClient.get_creator_info()/get_creator_all_fans()/get_creator_all_followings()/get_creator_all_dynamics()` |
| 登录态 | `media_platform/<platform>/login.py`（`BilibiliLogin.login_by_qrcode()` 等）+ `AbstractApiClient.update_cookies()` |
| 代理池 | `proxy/proxy_ip_pool.py: ProxyIpPool` + `proxy_mixin.py: ProxyRefreshMixin` |
| 滑块/工具 | `tools/slider_util.py: Slide`、`tools/easing.py` |
| 媒体下载 | `BilibiliClient.get_video_media()`、`XiaoHongShuClient.get_note_media()` 等 |
| 词云 | `tools/words.py: AsyncWordCloudGenerator` |
| 缓存 | `cache/cache_factory.py: CacheFactory`（local/redis） |
| 任务编排 | `api/services/crawler_manager.py: CrawlerManager`（子进程启动整条管线） |

### 11. 不应直接依赖的部分

1. **`store/<platform>/_store_impl.py`**：Dict→ORM 强耦合、逐条 commit、跨平台字段名不统一 — 应绕过，由我们自建领域模型。
2. **动态列名探测**：`store/excel_store_base.py`/`tools/async_file_writer.py` 用 `item.keys()` 当表头 — 首个数据决定 schema，不可作稳定契约。
3. **浏览器运行时求值**：`client.py` 内 `page.evaluate`（bilibili `get_wbi_keys()`、xhs `get_b1_from_localstorage()`）、`media_platform/xhs/playwright_sign.py: call_mnsv2()`、`tools/cdp_browser.py`、`libs/stealth.min.js`。
4. **平台签名黑盒**：`xhs/xhs_sign.py`、`playwright_sign.py`、`bilibili/help.py: BilibiliSign`、`libs/douyin.js`、`libs/zhihu.js` — 随风控频繁变，应留在采集侧。
5. **GraphQL**：`kuaishou/graphql.py` + `.graphql` 文件。
6. **`api/` 独立 WebUI**：无鉴权，仅内网。
7. **`config/` 全局可变模块 + `var.py` ContextVar**：并发多任务下全局状态互相污染，不适合并行调用。

---

## 三、整合分析

### 1. 两个项目的数据流

- **MatrixFlow**：`自有账号` → Patchright 浏览器自动化（发布/后台抓取）→ `accounts/videos/publish_tasks/video_stats`（自有 SQLite）→ 本地统计聚合/AI 建议。**方向：账号自有数据，写+读**。
- **MediaCrawler**：`公开内容` → Playwright + 签名 → `client` 业务方法 → `store/*` → `sqlite_tables.db`（或 json/excel）。**方向：公共数据，只读**。
- 两者**没有共享数据层**，也没有跨项目数据流——当前唯一"整合"是 MediaRadar 用 `search_lib/crawler_adapter.py` 以 subprocess 跑 MediaCrawler 再动态读表（该方案按决策淘汰）。

### 2. 数据模型差异

| 维度 | MatrixFlow | MediaCrawler | 冲突 |
|---|---|---|---|
| 模型组织 | 平台中立（accounts/video_stats/publish_tasks） | 按平台分表（bilibili_video/douyin_aweme/xhs_note…） | 需统一 Domain Model |
| ID | 自产 TEXT id + platform_video_id | aweme_id/note_id/video_id/content_id（类型异构） | 需 canonical_id |
| 指标 | INTEGER（play/like/comment/share/collect_count） | **字符串**（`str(stat)`，"12.3万"） | 需 Normalizer |
| 账号语义 | 自有账号（owner，可发布） | 观察对象（uid/nickname，无 cookie 归属） | 需 owner/observed 区分 |
| 时间 | `datetime('now')` ISO | unix 时间戳 BigInteger | 需统一 |

### 3. 功能重复

- **浏览器自动化/登录态/限流**：两者都有（Patchright vs Playwright），但场景不同（发布 vs 采集），不构成迁移，反而是**双栈冲突点**。
- **本地存储**：都有 SQLite + store 层，但 schema 与写入方式完全不同，**无重复可合并**。
- **统计聚合**：仅 MatrixFlow 有（MediaCrawler 无 analytics）。
- **AI/RAG/Memory**：两者都**没有** RAG 与 Memory；MatrixFlow 只有轻量 LLM 封装，MediaRadar（不在本项目范围）有 LangGraph/RAG 但按决策不引入。

### 4. 哪些能力应该保留

- **MediaCrawler 保留为采集能力**：`client.py` 层的搜索/详情/评论/用户方法 + 登录态 + 代理池，作为**数据源**经 Adapter 接入（遵守 P1 决策：Adapter→Normalizer→Unified Model→SMA DB）。
- **MatrixFlow 保留为设计参考**：平台适配器接口/注册中心、selectors 集中化、任务状态机+队列、限流器、SQL 迁移+Repository、LLM 多提供商+规则兜底、Stats 分层聚合、MCP 工具命名与参数校验思路。

### 5. 哪些能力应该重新实现（在 `app/`，Python）

- 统一领域模型 + `canonical_id` + **指标 Normalizer**（"12.3万"→数值）。
- RAG（FAISS，`VectorStore` 抽象）与 Memory（独立存储）— 两者原项目均无。
- LLM Gateway（Python：JSON 模式 + pydantic 校验 + 熔断 + 重试 + 缓存）— MatrixFlow 的 LLMService 过于简陋且含 bug；MediaRadar 版可作思路参考但按决策不直接引入。
- 数据采集 Adapter（`PlatformConnector` ABC + `MediaCrawlerConnector`）。
- Stats 聚合在 Python 侧按统一模型重写（数值化指标后计算才可靠）。

### 6. Connector / Adapter 设计建议

```
app/backend/src/socialmedia_agent/connectors/
  base.py                # PlatformConnector ABC: search(keywords) / fetch_detail(id) / fetch_comments(id) / fetch_creator(id)
  mediacrawler/
    runner.py            # 子进程调度 MediaCrawler（隔离 venv），按平台/关键词/模式触发
    reader.py            # 显式 schema 读取 sqlite_tables.db（固定字段映射，不做列名探测）
    adapter.py           # 实现 PlatformConnector：runner→reader→产出 RawItem DTO
  normalizers/           # 数值/时间/ID 归一 → Unified Domain Model
```
关键点：Adapter 的**边界在 client 业务语义**（search/detail/comment），**绕过 store/_store_impl**；MediaCrawler 的 SQLite 只是中转，核心库只有 SMA 自己的 DB。

### 7. MediaCrawler 如何作为数据源接入

两阶段演进（同一 Adapter 接口后）：
- **P1（快速）**：`runner.py` 子进程跑 `main.py --platform ... --save_data_option sqlite`，`reader.py` 显式读中转库 → Normalizer。优点：隔离干净、不依赖其内部全局状态；缺点：进程开销、需要建表。
- **后续（可选，ADR 决定）**：直接 import `client.py` 业务方法（`BilibiliClient.search_video_by_keyword()` 等）在进程内封装异步采集服务。优点：无需中转库；风险：`config` 全局可变模块、asyncio/浏览器生命周期、Playwright 依赖进入核心环境，需严格封装。
- 推荐 P1 用子进程方案，后续再评估进程内方案。

### 8. MatrixFlow 哪些能力作为业务逻辑参考

- 平台适配器**接口形态**（新增平台成本最低）。
- **selectors 集中 + 失效检测**理念（未来接自有账号时借鉴）。
- **任务状态机 + 优先队列 + 持久化恢复**（作为 SMA 采集/分析任务调度的模式参考）。
- **RateLimiter** 语义（并发+滑窗，按平台粒度）。
- **规则兜底**思想（Agent 的 LLM 失败时降级确定性规则，保证可用性）。
- **Stats 分层聚合**（video/account/platform/overview 的指标维度划分）。
- **MCP 工具命名与校验模式**（5~8 个工具时参考，不复制其实现）。

### 9. 技术风险（结合源码事实）

1. **双自动化栈**：MediaCrawler=Python Playwright，MatrixFlow=Node Patchright。P1 只接 MediaCrawler 可规避；未来接自有账号发布时若复用 MatrixFlow 思路，需在 Python 侧重写。
2. **指标是字符串**：MediaCrawler `liked_count=str(...)`、"12.3万"，Normalizer 必须处理单位/空值/`--`。
3. **MediaCrawler 全局可变 config + ContextVar**：子进程模式天然隔离此风险；进程内模式需避免并发污染。
4. **逐条 commit 性能**：MediaCrawler store 逐条 select+commit，不适合作为 SMA 高频查询源（SMA 不依赖它，OK）。
5. **登录/风控/签名易碎**：xhs_sign/WBI/stealth 等会随平台变化失效，SMA 依赖的采集链路稳定期有限，P1 选登录门槛低的平台（bilibili/xhs）降低风险。
6. **MediaCrawler 依赖未在 requirements.txt**（playwright、sqlalchemy async、aiosqlite、typer、hdbscan 等），隔离 venv 是硬前提。
7. **License**：MediaCrawler NON-COMMERCIAL LEARNING LICENSE，保留版权头。
8. **无 RAG/Memory 可复用**：全部自建，是工作量主要来源之一（但架构已在方案中定型）。

### 10. P0 / P1 最合理的实施顺序

**P0（地基，前置依赖）**
1. 整理 third_party（抽出 `MediaCrawler-main/`、只读化），写 `third_party/README.md`
2. `app/backend` 骨架：pyproject / src 布局 / `.env.example` / `docs/adr/`
3. SQLAlchemy 2.0 + Alembic 初始化（SQLite）
4. **领域模型**：Account/Content/Metric/Comment/Topic + enums + `canonical_id` 规则（提交 `docs/data-model.md`）
5. Normalizer 骨架（接口/registry/数值/时间/ID）
6. `VectorStore`/`Embedder` 接口（FAISS 实现 P2 填充）
7. pytest 基建 + P0 单测
8. （并行启动）MatrixFlow/MediaRadar 关键模块 ADR 初稿

**P1（数据接入，依赖 P0 的 4/5）**
1. MediaCrawler 隔离 venv + `bilibili` 单平台跑通（`--type search --save_data_option sqlite --init_db sqlite`）
2. `runner.py`（子进程调度、超时/重试/日志）
3. `reader.py`（显式 schema 映射，读 `sqlite_tables.db`）
4. `normalizers` 完整实现（数值"万/亿"、时间戳→ISO、ID 派生、平台规则注册）
5. `repositories`（Account/Content/Metric + 幂等 upsert，`canonical_id+captured_at` 去重）
6. `IngestService` 全链路 + FastAPI 查询接口 + CLI `ingest` 命令
7. 测试（normalizer 单测 / ingest 集成 / 幂等 / API）+ 真实数据端到端验收（**P1 DoD 九条**）

---

## 勘误提醒（供后续核对）

- `bilibili/stats.ts: fetchVideoStats(videoId)`（:92）是占位实现，直接返回 error —— MatrixFlow 的"单视频统计"实际未实现。
- MatrixFlow 宣称的"AES-256-GCM Cookie 加密"与代码不符（Cookie 明文 `storageState`）。
- `mcp-server/bridge.ts` 的 `ensureSchema()` 简化 schema 与主库不一致，若复用其直连方案会写坏数据。

---

> 分析日期：2026-08-24
> 说明：本报告为纯源码勘探产出，未修改任何文件。
