# 文档索引

> `docs/` 的导航与维护约定。**新人或接手者请按下方顺序阅读。**

---

## 阅读顺序

| # | 文档 | 回答什么问题 |
| --- | --- | --- |
| 1 | [`../README.md`](../README.md) | 怎么跑起来：环境、安装、配置、常用命令 |
| 2 | [`../AGENTS.md`](../AGENTS.md) | 怎么改代码：工程铁律、流程与审批约束 |
| 3 | [`architecture.md`](architecture.md) | 系统长什么样：分层、模块职责、数据流、关键抽象 |
| 4 | [`data-model.md`](data-model.md) | 数据长什么样：领域模型、`canonical_id`、表结构、幂等键 |
| 5 | [`api.md`](api.md) | 对外契约：HTTP 端点与输出结构 |
| 6 | [`status.md`](status.md) | 现在到哪了：进度、DoD 对照、未完成清单、续作步骤 |
| 7 | [`issues.md`](issues.md) | 踩过哪些坑：问题、**怎么发现的**、根因与教训（面试讲解用） |
| 8 | [`adr/`](adr/) | 为什么这么设计：决策记录与第三方模块三线表 |
| 9 | [`source-analysis.md`](source-analysis.md) | 第三方到底有什么：MatrixFlow / MediaCrawler 已核验源码事实 |
| 10 | [`compliance.md`](compliance.md) | 能不能用：License、平台 ToS、个人信息边界 |
| 11 | [`plan-frontend.md`](plan-frontend.md) | 前端设计依据与验收清单（**已实施**） |

---

## 各文档职责与更新时机

| 文档 | 单一职责 | 何时更新 |
| --- | --- | --- |
| `architecture.md` | 描述**架构现状**（不含进度、不含历史） | 架构变化并完成 ADR 之后 |
| `data-model.md` | 领域模型与数据库结构的权威描述 | 领域模型 / 表结构变化之后 |
| `api.md` | HTTP 接口与输出契约 | 端点或契约变化之后 |
| `status.md` | **唯一进度来源**：阶段、DoD、未完成清单、续作步骤 | 每完成一个任务后 |
| `issues.md` | 问题、根因与**可迁移的教训**（过程性知识） | 修完一个非平凡问题后补一条 |
| `adr/*.md` | 单项架构决策的完整记录 | 新决策时（复制 `adr/template.md`） |
| `source-analysis.md` | 第三方源码的已核验事实 | 重新勘探第三方源码时 |
| `compliance.md` | License / ToS / 个人信息边界 | 数据源或使用方式变化时 |
| `plan-frontend.md` | 前端设计依据与验收清单 | 前端范围变化时 |

---

## 维护约定

1. **进度只写在 `status.md`**，其他文档不得重复记录进度或 DoD 状态。
2. **`architecture.md` 只描述现状**，不写计划、不写历史分析（历史分析见 `source-analysis.md`，已完成的计划由 git 历史保留）。
3. **架构或数据模型变更必须先走 ADR**，再同步 `architecture.md` / `data-model.md`。
4. 第三方源码事实以 `source-analysis.md` 为准；若与源码不一致，**以源码为准**并在该文档记录差异。
5. ADR 编号从 `0002` 起（`0001` 未落盘）；新增 ADR 复制 [`adr/template.md`](adr/template.md)。
6. **踩过的坑写进 `issues.md`**：修完一个非平凡问题后补一条，骨架为
   `现象 -> 怎么发现的 -> 根因 -> 修复 -> 可迁移的教训`；「怎么发现的」这一栏最重要。

---

## 当前文档清单

```
docs/
├── README.md             # 本文件：索引与维护约定
├── architecture.md       # 架构：分层 / 模块 / 数据流 / 抽象 / 隔离 / 依赖
├── data-model.md         # 领域模型、canonical_id、表结构、幂等键
├── api.md                # HTTP 接口与输出契约
├── status.md             # 进度、DoD 对照、未完成清单、续作步骤
├── issues.md             # 问题、根因与教训（面试讲解用）
├── compliance.md         # License / ToS / 个人信息边界
├── source-analysis.md    # 第三方源码分析（已核验事实）
├── plan-frontend.md      # 前端设计依据与验收清单（已实施）
├── eval/                 # 评测证据：真实跑出的报告原文（可复核数字 + 重跑命令）
└── adr/
    ├── README.md         # ADR 索引 + 第三方模块三线表
    ├── template.md       # ADR 模板
    ├── 0002-llm-gateway.md
    ├── 0003-account-diagnosis.md
    ├── 0004-own-account-data.md
    └── 0005-frontend.md
```
