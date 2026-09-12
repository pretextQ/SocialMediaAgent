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
