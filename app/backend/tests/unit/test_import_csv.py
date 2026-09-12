"""CSV 手工导入测试（TDD）。

覆盖：
- 行 -> RawContent 的映射与 source=manual 标注
- 非法平台代号 / 缺必填列 / 非法 content_type -> CsvImportError
- 端到端：CSV -> 统一领域模型入库（Account / Content / Metric）
- 重复执行幂等（不产生重复行）
- 文件缺失 / 空 CSV -> 退出码 1
"""

import csv

import pytest

from socialmedia_agent.cli.import_csv import CsvImportError, main, row_to_raw
from socialmedia_agent.database.session import Database
from socialmedia_agent.domain.enums import MetricSource, MetricType
from socialmedia_agent.repositories.account_repo import AccountRepository
from socialmedia_agent.repositories.content_repo import ContentRepository
from socialmedia_agent.repositories.metric_repo import MetricRepository
from socialmedia_agent.repositories.topic_repo import TopicRepository

HEADER = [
    "platform", "account_platform_id", "account_nickname", "content_platform_id",
    "title", "content", "content_type", "publish_time", "url",
    "views", "likes", "comments", "shares", "favorites",
]


def write_csv(path, rows):
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(HEADER)
        writer.writerows(rows)
    return path


def sample_rows():
    return [
        ["bili", "10001", "示例账号", "90001", "标题一", "正文", "video",
         "2026-09-01T10:00:00Z", "https://example.com/1", "12000", "640", "58", "20", "300"],
        ["bili", "10001", "示例账号", "90002", "标题二", "", "video",
         "2026-09-03T10:00:00Z", "", "900", "20", "1", "", ""],
    ]


def as_row(values):
    return dict(zip(HEADER, values))


def test_row_to_raw_marks_manual_source_and_parses_metrics():
    raw = row_to_raw(as_row(sample_rows()[0]), line_no=2)
    assert raw.platform.value == "bilibili"
    assert raw.platform_id == "90001"
    assert raw.source == MetricSource.MANUAL
    assert raw.metrics[MetricType.VIEWS] == "12000"
    assert raw.metrics[MetricType.FAVORITES] == "300"


def test_row_to_raw_skips_blank_metrics():
    raw = row_to_raw(as_row(sample_rows()[1]), line_no=3)
    assert MetricType.SHARES not in raw.metrics
    assert MetricType.FAVORITES not in raw.metrics
    assert raw.metrics[MetricType.VIEWS] == "900"
    assert raw.account_platform_id == "10001"


def test_row_to_raw_unknown_platform_raises():
    row = as_row(sample_rows()[0])
    row["platform"] = "unknown_platform"
    with pytest.raises(CsvImportError, match="平台代号"):
        row_to_raw(row, line_no=2)


def test_row_to_raw_missing_required_raises():
    row = as_row(sample_rows()[0])
    row["content_platform_id"] = ""
    with pytest.raises(CsvImportError, match="缺少必填列"):
        row_to_raw(row, line_no=2)


def test_row_to_raw_invalid_content_type_raises():
    row = as_row(sample_rows()[0])
    row["content_type"] = "podcast"
    with pytest.raises(CsvImportError, match="content_type"):
        row_to_raw(row, line_no=2)


def test_import_csv_persists_unified_domain_models(tmp_path, capsys):
    csv_path = write_csv(tmp_path / "data.csv", sample_rows())
    db_url = f"sqlite:///{tmp_path / 'import.db'}"

    assert main(["--input", str(csv_path), "--db-url", db_url]) == 0

    database = Database(url=db_url)
    with database.session() as session:
        accounts = AccountRepository(session).list()
        contents = ContentRepository(session).list()
        metrics = MetricRepository(session).list()

    assert len(accounts) == 1
    assert accounts[0].canonical_id == "bilibili:10001"
    assert len(contents) == 2
    assert {c.canonical_id for c in contents} == {"bilibili:90001", "bilibili:90002"}
    # 第一条 5 个指标 + 第二条 3 个指标
    assert len(metrics) == 8
    assert all(m.source == MetricSource.MANUAL.value for m in metrics)

    views = [m for m in metrics if m.metric_type == MetricType.VIEWS.value]
    assert sorted(str(m.value) for m in views) == ["12000.0000", "900.0000"]


def test_import_csv_is_idempotent_on_rerun(tmp_path):
    csv_path = write_csv(tmp_path / "data.csv", sample_rows())
    db_url = f"sqlite:///{tmp_path / 'import.db'}"

    assert main(["--input", str(csv_path), "--db-url", db_url]) == 0
    assert main(["--input", str(csv_path), "--db-url", db_url]) == 0

    database = Database(url=db_url)
    with database.session() as session:
        assert len(AccountRepository(session).list()) == 1
        assert len(ContentRepository(session).list()) == 2
        assert len(MetricRepository(session).list()) == 8


def test_import_csv_missing_file_returns_error(tmp_path):
    assert main(["--input", str(tmp_path / "nope.csv")]) == 1


def test_import_csv_empty_file_returns_error(tmp_path):
    empty = tmp_path / "empty.csv"
    with empty.open("w", encoding="utf-8", newline="") as handle:
        csv.writer(handle).writerow(HEADER)
    assert main(["--input", str(empty), "--db-url", f"sqlite:///{tmp_path / 'e.db'}"]) == 1


def test_import_csv_reads_gbk_encoded_file(tmp_path):
    """Excel 在中文 Windows 上「另存为 CSV」默认是 GBK，必须能直接读。"""
    path = tmp_path / "gbk.csv"
    with path.open("w", encoding="gb18030", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(HEADER)
        writer.writerow(["bili", "10001", "中文账号", "90001", "中文标题", "正文内容", "video",
                         "2026-09-01T10:00:00Z", "", "12.3万", "640", "58", "", ""])
    db_url = f"sqlite:///{tmp_path / 'gbk.db'}"

    assert main(["--input", str(path), "--db-url", db_url]) == 0

    database = Database(url=db_url)
    with database.session() as session:
        contents = ContentRepository(session).list()
        metrics = MetricRepository(session).list()

    assert len(contents) == 1
    assert contents[0].title == "中文标题"
    views = [m for m in metrics if m.metric_type == MetricType.VIEWS.value]
    assert str(views[0].value) == "123000.0000"  # "12.3万" 由 Normalizer 归一


def test_import_csv_dry_run_does_not_write(tmp_path):
    csv_path = write_csv(tmp_path / "data.csv", sample_rows())
    db_file = tmp_path / "dry.db"

    assert main(["--input", str(csv_path), "--db-url", f"sqlite:///{db_file}", "--dry-run"]) == 0

    assert not db_file.exists()


def test_import_csv_invalid_row_writes_nothing(tmp_path):
    """整体校验：任一行非法则整体失败，不产生部分写入。"""
    rows = sample_rows()
    bad = list(rows[1])
    bad[0] = "unknown_platform"
    csv_path = write_csv(tmp_path / "data.csv", [rows[0], bad])
    db_file = tmp_path / "partial.db"

    assert main(["--input", str(csv_path), "--db-url", f"sqlite:///{db_file}"]) == 1

    assert not db_file.exists()


def test_import_csv_dry_run_reports_invalid_row(tmp_path):
    rows = sample_rows()
    bad = list(rows[0])
    bad[6] = "podcast"
    csv_path = write_csv(tmp_path / "data.csv", [bad])
    db_file = tmp_path / "dry2.db"

    assert main(["--input", str(csv_path), "--db-url", f"sqlite:///{db_file}", "--dry-run"]) == 1

    assert not db_file.exists()


def test_row_to_raw_defaults_to_manual_source():
    assert row_to_raw(as_row(sample_rows()[0]), line_no=2).source == MetricSource.MANUAL


def test_row_to_raw_accepts_explicit_synthetic_source():
    raw = row_to_raw(as_row(sample_rows()[0]), line_no=2, source=MetricSource.SYNTHETIC)
    assert raw.source == MetricSource.SYNTHETIC


def test_import_csv_source_flag_marks_metrics(tmp_path):
    """--source synthetic 必须落到 Metric.source，合成数据不得伪装成手工真实数据。"""
    csv_path = write_csv(tmp_path / "data.csv", sample_rows())
    db_url = f"sqlite:///{tmp_path / 'synth.db'}"

    assert main(["--input", str(csv_path), "--db-url", db_url, "--source", "synthetic"]) == 0

    database = Database(url=db_url)
    with database.session() as session:
        metrics = MetricRepository(session).list()

    assert metrics
    assert {m.source for m in metrics} == {MetricSource.SYNTHETIC.value}


def test_import_csv_rejects_unknown_source(tmp_path):
    csv_path = write_csv(tmp_path / "data.csv", sample_rows())
    with pytest.raises(SystemExit):
        main(["--input", str(csv_path), "--source", "not-a-source"])


# ---------------------------------------------------------------------------
# --topics：趋势分析需要 Topic 数据（demo 库此前 topics 为空，/trends/analysis 永远返回空）
# ---------------------------------------------------------------------------

TOPIC_HEADER = ["keyword", "platforms", "post_count", "title", "summary", "last_seen"]


def write_topic_csv(path, rows):
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(TOPIC_HEADER)
        writer.writerows(rows)
    return path


def test_import_topics_persists_topics(tmp_path):
    csv_path = write_csv(tmp_path / "data.csv", sample_rows())
    topics_path = write_topic_csv(tmp_path / "topics.csv", [
        ["效率工具测评", "bili", "88", "效率工具测评", "近 7 天热门", "2026-09-10T10:00:00Z"],
        ["Agent 工程化", "bili|zhihu", "50", "", "", "2026-09-11T10:00:00Z"],
    ])
    db_url = f"sqlite:///{tmp_path / 'topics.db'}"

    assert main(["--input", str(csv_path), "--topics", str(topics_path), "--db-url", db_url]) == 0

    database = Database(url=db_url)
    with database.session() as session:
        topics = TopicRepository(session).list()
    by_kw = {t.keyword: t for t in topics}
    assert set(by_kw) == {"效率工具测评", "Agent 工程化"}
    assert by_kw["效率工具测评"].post_count == 88
    assert by_kw["Agent 工程化"].platforms == ["bilibili", "zhihu"]


def test_import_topics_is_idempotent(tmp_path):
    csv_path = write_csv(tmp_path / "data.csv", sample_rows())
    topics_path = write_topic_csv(tmp_path / "topics.csv", [
        ["效率工具测评", "bili", "88", "", "", ""],
    ])
    db_url = f"sqlite:///{tmp_path / 'topics2.db'}"

    assert main(["--input", str(csv_path), "--topics", str(topics_path), "--db-url", db_url]) == 0
    assert main(["--input", str(csv_path), "--topics", str(topics_path), "--db-url", db_url]) == 0

    database = Database(url=db_url)
    with database.session() as session:
        assert len(TopicRepository(session).list()) == 1


def test_import_topics_invalid_row_writes_nothing(tmp_path):
    """整体校验同样覆盖 topics：非法话题行不能让内容先落库。"""
    csv_path = write_csv(tmp_path / "data.csv", sample_rows())
    topics_path = write_topic_csv(tmp_path / "topics.csv", [
        ["", "bili", "88", "", "", ""],  # 缺 keyword
    ])
    db_file = tmp_path / "topics_bad.db"

    assert main(["--input", str(csv_path), "--topics", str(topics_path),
                 "--db-url", f"sqlite:///{db_file}"]) == 1

    assert not db_file.exists()


def test_import_topics_unknown_platform_writes_nothing(tmp_path):
    csv_path = write_csv(tmp_path / "data.csv", sample_rows())
    topics_path = write_topic_csv(tmp_path / "topics.csv", [
        ["话题", "not-a-platform", "1", "", "", ""],
    ])
    db_file = tmp_path / "topics_bad2.db"

    assert main(["--input", str(csv_path), "--topics", str(topics_path),
                 "--db-url", f"sqlite:///{db_file}"]) == 1

    assert not db_file.exists()
