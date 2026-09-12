# 手工数据模板

## 这个目录是什么

`data_template.csv` 是**手工导入真实数据**的模板，用来解决「拿不到真实数据」的阻塞。
你不必使用采集器，也不必登录自己的账号——从**平台公开页面**手工整理即可。

## 怎么填

1. 复制模板：`copy data_template.csv my_data.csv`
2. **删掉 3 行示例**，替换成你的真实数据（一行 = 一条内容）
3. **先自检**（只校验，不写库）：

```powershell
cd app/backend
.venv/Scripts/python.exe -m socialmedia_agent.cli.import_csv --input seed/my_data.csv --dry-run
```

4. 确认无误后正式导入：

```powershell
.venv/Scripts/python.exe -m socialmedia_agent.cli.import_csv --input seed/my_data.csv
```

5. 验证：`GET /api/v1/accounts`、`GET /api/v1/contents`

行为说明：

- **幂等**：同一份 CSV 重复执行不会产生重复行。
- **整体校验**：任一行有错则整体失败，**不会写一半留脏数据**；报错会指明是第几行、哪一列。
- **编码**：Excel「另存为 CSV」默认的 **GBK 可以直接读**，也支持 UTF-8 与带 BOM 的「CSV UTF-8」。

## 字段说明

| 列 | 必填 | 说明 |
| --- | --- | --- |
| `platform` | 是 | 平台代号：`bili` / `xhs` / `dy` / `ks` / `wb` / `zhihu` / `tieba` |
| `account_platform_id` | 否 | 账号在平台内的 ID（留空则不建账号，只建内容） |
| `account_nickname` | 否 | 账号昵称 |
| `content_platform_id` | 是 | 内容在平台内的 ID（作为幂等键，务必唯一且稳定） |
| `title` | 否 | 标题 |
| `content` | 否 | 正文（可留空） |
| `content_type` | 是 | `video` / `image` / `article` / `note` |
| `publish_time` | 否 | ISO 时间（如 `2026-09-01T10:00:00Z`）或 unix 秒/毫秒 |
| `url` | 否 | 原文链接 |
| `views` `likes` `comments` `shares` `favorites` | 否 | 指标；**留空即不写入该指标**，支持 `12.3万` 这类平台口径（由 Normalizer 归一） |

## 数据从哪来（可以）

- 平台**公开页面**上肉眼可见的数据（播放 / 点赞 / 评论 / 发布时间），手工抄录；
- 你自己账号**创作者后台**的导出或截图数据；
- 公开数据集（下载后整理成本模板格式）。

## 什么不可以

- **不要编造数据**。评测的意义在于「标准答案」，编造会直接摧毁结论的可信度。
- 不要用自动化爬虫采集（合规风险，且项目已有明确的采集边界）。
- 不要填他人的非公开数据。

> 由本模板导入的指标 `source=manual`，与采集数据可区分、可审计。

## 需要多少

**30 条左右即可**。评测需要的不是数据量，而是「有 ground truth 的样本」：
每个数字都能在原始页面查证。

---

## 合成演示数据（SYNTHETIC，**不是真实数据**）

如果只是想**验证链路或做演示**，不必手抄 —— 用生成器造一份：

```powershell
.venv/Scripts/python.exe seed/generate_demo_data.py --output seed/demo_synthetic.csv
.venv/Scripts/python.exe -m socialmedia_agent.cli.import_csv --input seed/demo_synthetic.csv --db-url sqlite:///data/sma_demo.db --source synthetic
```

生成 2 个账号共 50 条内容：`AI 科普站`（稳定增长 + 一次爆款）、`效率工具研究所`（持续下滑）。
日期相对运行当天生成（不会过期），固定随机种子（可复现）。

**纪律（必须遵守）**：

- 必须带 `--source synthetic`，使其在 `Metric.source` 中可被识别；
- 必须导入**独立的 demo 库**（如 `data/sma_demo.db`），**不得混入真实库**；
- **绝不可作为真实业务数据，也绝不可作为评测依据** —— 评测的 ground truth 只能来自真实数据。
