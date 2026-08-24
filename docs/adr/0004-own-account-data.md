# ADR-0004: 自有账号数据接入（参考 MatrixFlow）

- 状态：已接受
- 日期：2026-08-24
- 相关阶段：P5
- 来源模块（已核验）：
  - `third_party/MatrixFlow-main/electron/services/session-manager.ts`: `writeStorageState()`（明文 Cookie）
  - `third_party/MatrixFlow-main/electron/services/StatsService.ts`: `fetchVideoStats()`（占位，`bilibili/stats.ts:92` 直接返回 error）
  - `third_party/MatrixFlow-main/electron/platform/<p>/upload|publish` + `embedded-browser/stealth-engine.ts`（Patchright 浏览器自动化发布）
  - `third_party/MatrixFlow-main/electron/platform/base/interfaces.ts`: `PlatformAdapter` 接口 + `PlatformRegistry`

## 背景

- 目标：接入「自有账号」（owner）数据，与现有「观察账号」（observed，经 MediaCrawler）区分，支撑发布历史/后台统计等自有数据能力。
- MatrixFlow 本质是 Node/Electron + Patchright 的自有账号工具（发布 + 后台统计抓取 + 本地聚合）。
- 主工程约束（AGENTS.md / architecture-analysis.md）：统一 Python；`third_party` 只读；第三方能力必须走 ADR 四选一；数据采集必须 `Connector → Normalizer → Unified Domain Model`；合规边界。

## 决策

1. **浏览器自动化路径整体不采用**：不移植 MatrixFlow 的登录态（明文 Cookie）、发布/上传适配器、stealth 反检测。
2. **自有账号数据接入方式 = 平台官方能力优先 + Python 重写只读适配器**（`Adapter 封装 / 重新实现`），纳入现有 `PlatformConnector` 边界（`connectors/matrixflow_ref/` 规划目录）。
3. **平台适配器接口形态 = 参考**：借鉴 `PlatformAdapter` + 注册中心思路，在 Python `PlatformConnector` 上按自有账号数据源扩展，不复制实现。

## 理由

- 源码事实：MatrixFlow 的 `fetchVideoStats` 为占位实现（返回 error），宣称的 AES Cookie 加密与实现不符（明文 `storageState`，见 source-analysis.md 勘误）——直接封装价值低。
- 双技术栈：Node Patchright vs Python Playwright，机械移植成本高且无共享代码价值。
- 合规（AGENTS.md / 三线表）：浏览器自动化发布与反检测涉平台 ToS 风险，前期已判「不采用」。
- 架构一致性：自有账号数据同样走统一领域模型（Account `owner_type=owner`），复用现有 Metric/Content 数据层与 Agent 能力，无需引入第三方内部实现。
- 官方能力优先：自有账号后台统计优先平台官方 API / 开放能力（如 bilibili 创作者中心接口），经 Adapter 封装，可替换、可审计。

## 验证方式

- P5 DoD「自有账号接入（经 ADR）完成并有测试」：本 ADR 决策落地后，实现 `connectors/matrixflow_ref/` 只读适配器 + Normalizer 扩展 + fixture 测试（mock 平台响应）。
- 本阶段先完成 ADR 决策（本文档），实现与测试在自有账号适配器子任务中跟进。

## 后果

- 正面：自有账号数据与观察账号数据统一模型；避免脆弱/不合规的浏览器自动化；保持技术栈纯 Python。
- 负面/风险：自有账号后台统计依赖平台官方 API 可用性与授权；若平台无官方接口，只读抓取仍需单独合规评估；「发布写操作」本阶段不实现（列为后续单独 ADR）。

## 参考代码

- `electron/services/session-manager.ts: writeStorageState()`（明文 Cookie → 不采用）
- `electron/services/StatsService.ts`、`bilibili/stats.ts:92`（占位统计 → 重新实现）
- `electron/platform/base/interfaces.ts`（适配器接口形态 → 参考）
- `electron/platform/<p>/upload|publish`、`embedded-browser/stealth-engine.ts`（发布/反检测 → 不采用）
