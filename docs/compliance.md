# 合规与数据边界

> 本文记录本项目的 License、平台条款与个人信息边界。
> 结论基于**已核验的源码事实**（核验方式见各条目）。

---

## 1. 一句话结论

**本项目仅可用于学习、研究与技术演示。**
当前数据采集通道依赖第三方非商用许可的爬虫，且以浏览器自动化方式访问平台，
**不得用于商业用途**；若要商用，必须先将数据源替换为平台官方开放能力。

---

## 2. third_party 构成与许可

| 目录 | 内容 | 许可 | 核验方式 |
| --- | --- | --- | --- |
| `third_party/MatrixFlow-main/` | Electron 桌面应用（仅作源码参考） | **MIT** | 读取 `LICENSE` 文件：`MIT License / Copyright (c) 2024-2026 MatrixFlow` |
| `third_party/MediaRadar-main/` | 舆情分析系统（仅作架构参考） | 未随源码提供 LICENSE 文件 | 目录内未检索到 LICENSE |
| `third_party/MediaRadar-main/backend/services/crawler_service/` | MediaCrawler（**本项目实际的数据采集依赖**） | **NON-COMMERCIAL LEARNING LICENSE 1.1** | 见下 |

### 2.1 MediaCrawler 的许可证据

- 该目录下绝大多数源文件头部均带声明：`Licensed under NON-COMMERCIAL LEARNING LICENSE 1.1`
  （在 `crawler_service/` 内检索 `license` 命中 597 处，覆盖 `base/`、`cache/`、`config/`、`constant/`、`model/`、
  `media_platform/`、`store/`、`tools/` 等子包）。
- `third_party/MediaRadar-main/docs/CRAWLER_AUDIT.md:18` 明确写有 `Licensed under NON-COMMERCIAL LEARNING LICENSE 1.1`，
  同文件 `:21` 中文结论：**「禁止商业用途」**。
- 上游仓库：`https://github.com/NanmiCoder/MediaCrawler`（见 `CRAWLER_AUDIT.md:17`）。

> **注意（已核验的瑕疵）**：源文件头部提示「详细许可条款请参阅项目根目录下的 LICENSE 文件」，
> 但 `crawler_service/` 目录内**并不存在 LICENSE 文件本体**。完整条款需回到上游仓库获取。

### 2.2 因此产生的约束

- 本项目**不得直接商用**，除非替换该采集通道。
- `third_party/` 在本仓库中**只读**：不修改、不 import、保留原始版权头。

---

## 3. 平台服务条款（ToS）风险

采集链路使用浏览器自动化，涉及：

- 模拟登录态（Cookie / storage state）访问平台；
- 平台签名与风控绕过（WBI 签名、`xhs_sign`、stealth 脚本等，位于采集侧）；
- 代理池与并发请求。

这些行为通常**不被平台服务条款允许**，可能触发账号封禁或法律风险。
本项目不对使用者的采集行为承担责任。

---

## 4. 个人信息（PIPL）边界

当前模型包含可能构成个人信息的字段：

| 字段 | 位置 | 风险 |
| --- | --- | --- |
| `Account.nickname` / `avatar_url` | `domain/account.py` | 账号标识 |

> 注：评论模型（`Comment`）及其 `author_nickname` / `content` 字段已随死代码清理移除——该模型从未接入
> Repository / API / 采集链路。删除后个人信息面缩小到账号标识。

**当前缺失的保护措施**（截至本文更新）：

- 无采集授权 / 告知同意机制；
- 无脱敏或假名化处理；
- 无留存期限与到期清理策略（仅 Memory 有 TTL）；
- 无个人信息主体的查询 / 删除请求处理流程。

> 这些是企业化使用前必须补齐的项，当前状态见 [`status.md`](status.md)。

---

## 5. 本项目的数据使用边界

**只做**：

- 读取与分析公开数据 / 自有账号数据；
- 输出运营建议与 Markdown 报告（人类可读）。

**不做**：

- 不自动发布、不自动评论、不执行任何写操作；
- 不交付采集脚本、不做批量抓取：仓库中用于评测的 19 条真实数据取自平台**公开**页面/接口的
  低频只读核验（无登录、无浏览器自动化、无代理、无采集脚本），每条保留原始链接可回查，
  数据文件与库均不入 git；
- HTTP API 无数据写入端点（数据输入走 CLI：手工导入 `import_csv`、自动采集 `ingest`，或程序化写入）；
- 不将数据库事实与 LLM 推理混同（LLM 不得编造业务数据）。

---

## 6. 若要商用：必须完成的前置条件

1. **替换数据源**：改用平台官方开放能力（企业 / 创作者 API）；架构已为此预留
   `PlatformConnector` 抽象，业务层无需改动（参见 [ADR-0004](adr/0004-own-account-data.md)）。
2. **删除或隔离爬虫依赖**：移除 `connectors/mediacrawler/` 及 `requirements-crawler.txt`，
   避免非商用许可进入交付物。
3. **补齐合规机制**：采集授权、个人信息脱敏、留存与删除策略、审计日志。
4. **补齐访问控制**：当前项目为**单用户本地工具**，无认证与多租户（见 [`status.md`](status.md) 已知风险）。

---

## 7. 免责声明

本项目为个人学习与技术验证性质的开源实践，不构成任何法律意见。
使用者应自行确保其使用行为符合所在地法律法规及目标平台的服务条款。
