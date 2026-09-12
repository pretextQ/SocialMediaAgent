# 数据模型

> 领域模型与数据库结构的权威描述。分层与模块职责见 [`architecture.md`](architecture.md)。

---

## 1. 设计原则

1. **`domain/` 是纯 Pydantic 契约**，不绑定 ORM；`models/` 负责 `domain <-> DB` 双向映射。
2. **`canonical_id` 是跨表关联与幂等的唯一键**，由 `platform + platform_id` 强制派生，不允许手工指定。
3. **数值用 `Decimal`**（对应数据库 `Numeric(20,4)`），保留原始串 `raw_value` 用于审计。
4. **时间统一按 UTC 存取**（`UTCDateTime` TypeDecorator），SQLite 读出后可保持 aware。
5. **指标以 `source` 标注来源**，保证数据可追溯。

## 2. 枚举

| 枚举 | 取值 |
| --- | --- |
| `Platform` | `douyin` `xiaohongshu` `bilibili` `kuaishou` `channels` `weibo` `zhihu` `tieba` |
| `OwnerType` | `owner`（自有账号）/ `observed`（观察账号，默认） |
| `ContentType` | `video` `image` `article` `note` |
| `MetricType` | `views` `likes` `comments` `shares` `favorites` |
| `MetricSource` | `mediacrawler` `matrixflow` `official_api` `manual` |
| `MemoryCategory` | `positioning` `high_performance` `low_performance` `strategy` `result` `longterm` |

> 平台代号（`bili` / `xhs` / `dy` …）到 `Platform` 的映射在 `normalizers/ids.py` 完成，领域层只使用完整英文名。

## 3. canonical_id 规则

```
canonical_id = f"{platform.value}:{platform_id}"       # 例：bilibili:90001
```

- 由 `domain/identity.make_canonical_id` 实现，`Account` / `Content` 的 `model_validator` 在构造后**强制覆盖**该字段。
- 内容通过 `Content.account_id` 指向 `Account.canonical_id`；指标通过 `content_id` 指向 `Content.canonical_id`。
- 因此跨表关联不依赖自增主键，采集重复执行也不会产生重复行。

## 4. 领域模型

### 4.1 Account（账号）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `str?` | 内部主键（uuid hex），DB 生成 |
| `canonical_id` | `str` | 派生，唯一 |
| `platform` | `Platform` | 平台 |
| `platform_id` | `str` | 平台内 ID |
| `nickname` / `avatar_url` | `str?` | 昵称 / 头像 |
| `owner_type` | `OwnerType` | 自有 / 观察，默认 `observed` |
| `extra` | `dict` | 平台附加信息 |

### 4.2 Content（内容）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` / `canonical_id` | `str?` / `str` | 同上 |
| `platform` / `platform_content_id` | | 平台与平台内内容 ID |
| `account_id` | `str?` | 指向 `Account.canonical_id` |
| `title` / `content` | `str?` | 标题 / 正文 |
| `content_type` | `ContentType` | 必需 |
| `publish_time` | `datetime?` | UTC |
| `url` | `str?` | 原文链接 |
| `raw_metadata` | `dict` | 原始附加字段 |

### 4.3 Metric（指标）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `content_id` / `account_id` | `str?` | **至少锚定其一**（validator 强制） |
| `platform` | `Platform` | |
| `metric_type` | `MetricType` | |
| `value` | `Decimal` | 归一后的数值 |
| `captured_at` | `datetime` | 采集时间（UTC） |
| `source` | `MetricSource` | 来源，审计用 |
| `raw_value` | `str?` | 原始串（如 `12.3万`） |

### 4.4 Topic（话题）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `keyword` | `str` | 幂等键 |
| `title` / `summary` | `str?` | |
| `platforms` | `list[Platform]` | 覆盖平台 |
| `first_seen` / `last_seen` | `datetime?` | 时间窗口过滤依据 |
| `post_count` | `int` | 话题热度 |
| `sentiment` | `dict` | 情感等扩展信息 |

> `platforms` 在 DB 中是 JSON 数组，因此按平台 / 时间过滤在 **Python 侧**完成（避免方言差异）。

## 5. 数据库表与约束

| 表 | 关键约束 |
| --- | --- |
| `accounts` | `canonical_id` UNIQUE 且索引；`platform`、`owner_type` 有索引 |
| `contents` | `canonical_id` UNIQUE；`account_id` FK -> `accounts.canonical_id` |
| `metrics` | `content_id` FK -> `contents.canonical_id`；`account_id` FK -> `accounts.canonical_id`；`value` `Numeric(20,4)`；`captured_at` 索引 |
| `topics` | `keyword` 索引；`platforms` / `sentiment` 为 JSON |
| `memory_entries` | **独立库**（`MemoryBase`，与核心库 Base 分离）：`account_id` / `category` 索引，`expires_at` 支持 TTL |

SQLite 连接建立时开启 `PRAGMA foreign_keys=ON`。**建表与变更走 Alembic 迁移**（`app/backend/migrations/`，
生产入口 API 启动 / `import_csv` / `ingest` 都会 `upgrade head`）；测试与临时库仍可用 `Base.metadata.create_all`，
两者一致性由 `tests/unit/test_migrations.py` 守护。既有（`create_all` 建的）库会被自动**收养**：先 stamp 基线版本、再 upgrade。

## 6. 幂等键（重复执行不产生脏数据）

| 实体 | 幂等键 | 语义 |
| --- | --- | --- |
| Account | `canonical_id` | 覆盖更新昵称 / 头像 / owner_type / extra |
| Content | `canonical_id` | 覆盖更新标题 / 正文 / 发布时间 / 元数据 |
| Metric | `(content_id, account_id, metric_type, source)` | **最新快照**：同一锚点同一指标重复采集时更新为最新值 |
| Topic | `keyword` | 覆盖更新热度 / 时间窗口 / 摘要 |

数据入库链路（两条路径共用 `RawContent -> Normalizer -> Repository`）：

```
采集：Connector        -> RawContent --\
手工：CLI import_csv   -> RawContent --/ -> Normalizer(Mapper) -> Unified Domain Model -> Repository.upsert
```

`RawContent.source` 标注来源（默认 `mediacrawler`；手工导入为 `manual`），最终写入 `Metric.source`，保证来源可追溯。

## 7. 已知语义问题

- **Metric 是「最新快照」而不是时间序列**：同一指标的历史值会被覆盖，当前无法回答「某指标随时间如何变化」。这会影响趋势 / 历史分析的真实性，尚未决策（见 [`status.md`](status.md) 技术债）。
- `Topic.platforms` 的 JSON 存储使平台过滤无法下推到 SQL，数据量大时需重新设计。
