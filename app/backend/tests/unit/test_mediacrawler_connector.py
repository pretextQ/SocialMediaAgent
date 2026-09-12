"""MediaCrawler 连接器测试（使用假中转库 + mock runner，无需爬虫 venv）。"""

import sqlite3

import pytest

from socialmedia_agent.connectors.mediacrawler.adapter import MediaCrawlerConnector
from socialmedia_agent.connectors.mediacrawler.reader import MediaCrawlerReader
from socialmedia_agent.connectors.mediacrawler.runner import MediaCrawlerRunError, MediaCrawlerRunner
from socialmedia_agent.connectors.mediacrawler.schemas import get_table_schema
from socialmedia_agent.domain.enums import ContentType, MetricType, Platform

_BILI_COLUMNS = [
    "id", "video_id", "video_url", "user_id", "nickname", "liked_count",
    "title", "desc", "create_time", "video_play_count", "video_comment",
    "video_share_count", "video_favorite_count",
]


@pytest.fixture
def staging_db(tmp_path):
    """构造符合 bilibili_video 显式 schema 的假中转库。"""
    db_path = tmp_path / "sqlite_tables.db"
    conn = sqlite3.connect(db_path)
    conn.execute(
        "CREATE TABLE bilibili_video ("
        "id INTEGER PRIMARY KEY, "
        "video_id INTEGER, video_url TEXT, user_id INTEGER, nickname TEXT, "
        "liked_count TEXT, title TEXT, [desc] TEXT, create_time INTEGER, "
        "video_play_count TEXT, video_comment TEXT, video_share_count TEXT, "
        "video_favorite_count TEXT)"
    )
    conn.executemany(
        "INSERT INTO bilibili_video (video_id, video_url, user_id, nickname, liked_count,"
        " title, [desc], create_time, video_play_count, video_comment, video_share_count,"
        " video_favorite_count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        [
            (
                1001, "https://b23.tv/av1001", 90001, "UP主A", "12.3万",
                "人工智能入门", "这是关于AI的教程", 1724479200, "12.3万", "1,234", "567", "890",
            ),
            (
                1002, "https://b23.tv/av1002", 90001, "UP主A", "8",
                "无关美食视频", "和关键词无关", 1724479300, "8", "2", "0", "1",
            ),
            (
                1003, "https://b23.tv/av1003", 90002, "UP主B", "1000",
                "人工智能应用案例", "AI落地实践", 1724479400, "1000", "--", "20", "30",
            ),
        ],
    )
    conn.commit()
    conn.close()
    return db_path


def test_get_table_schema_bilibili():
    schema = get_table_schema("bili")
    assert schema.table == "bilibili_video"
    assert schema.platform == Platform.BILIBILI
    assert schema.content_type == ContentType.VIDEO
    assert schema.metric_columns[MetricType.VIEWS] == "video_play_count"


def test_get_table_schema_unknown_raises():
    with pytest.raises(KeyError):
        get_table_schema("unknown_platform")


def test_get_table_schema_accepts_long_platform_name():
    """技术债：schemas 自己维护了一份平台代号映射，漏了 'bilibili' 长写。

    现在统一复用 normalizers.platform_from_code（项目里**唯一**的平台代号来源），
    长写与前缀写都接受——此前传长写会得到一句令人困惑的「不支持的平台代号」。
    """
    assert get_table_schema("bilibili").table == "bilibili_video"
    assert get_table_schema("bili").table == "bilibili_video"


def test_get_table_schema_known_but_unsupported_platform():
    """能识别的平台但没有显式 schema 时，报「尚未提供」而不是「不支持」。"""
    with pytest.raises(KeyError, match="尚未提供"):
        get_table_schema("xhs")


def test_reader_reads_latest_matching_keyword(staging_db):
    reader = MediaCrawlerReader(staging_db)
    rows = reader.read_latest_contents("bili", "人工智能", max_count=10)
    by_id = {r["id"]: r for r in rows}
    assert set(by_id) == {1001, 1003}  # 1001、1003 命中；1002 未命中
    assert by_id[1001]["metrics"][MetricType.VIEWS] == "12.3万"
    assert by_id[1001]["metrics"][MetricType.COMMENTS] == "1,234"
    assert by_id[1003]["metrics"][MetricType.VIEWS] == "1000"


def test_reader_missing_db_raises(tmp_path):
    reader = MediaCrawlerReader(tmp_path / "nope.db")
    with pytest.raises(FileNotFoundError):
        reader.read_latest_contents("bili", "人工智能")


def test_runner_builds_command_and_runs(monkeypatch, tmp_path, staging_db):
    captured = {}
    fake_python = tmp_path / "python.exe"
    fake_python.write_text("")

    def fake_run(cmd, **kwargs):
        captured["cmd"] = cmd
        captured["cwd"] = kwargs["cwd"]
        return type("R", (), {"returncode": 0, "stderr": ""})()

    monkeypatch.setattr("subprocess.run", fake_run)
    runner = MediaCrawlerRunner(
        crawler_dir=tmp_path,
        python_executable=fake_python,
        timeout=10,
    )
    runner.run_search("bili", "人工智能", max_count=3)
    assert captured["cmd"][0] == str(fake_python)
    assert "main.py" in captured["cmd"]
    assert "--platform" in captured["cmd"] and "bili" in captured["cmd"]
    assert "--keywords" in captured["cmd"]


def test_runner_failure_raises(monkeypatch, tmp_path):
    fake_python = tmp_path / "python.exe"
    fake_python.write_text("")

    def fake_run(cmd, **kwargs):
        return type("R", (), {"returncode": 2, "stderr": "boom"})()

    monkeypatch.setattr("subprocess.run", fake_run)
    runner = MediaCrawlerRunner(crawler_dir=tmp_path, python_executable=fake_python)
    with pytest.raises(MediaCrawlerRunError, match="boom"):
        runner.run_search("bili", "人工智能")


def test_runner_missing_python_raises(tmp_path):
    runner = MediaCrawlerRunner(crawler_dir=tmp_path, python_executable=tmp_path / "nope.exe")
    with pytest.raises(MediaCrawlerRunError, match="解释器"):
        runner.run_search("bili", "人工智能")


def test_adapter_search_integration(monkeypatch, staging_db, tmp_path):
    class FakeRunner:
        def run_search(self, platform, keyword, max_count=3):
            pass

    adapter = MediaCrawlerConnector(runner=FakeRunner(), reader=MediaCrawlerReader(staging_db))
    items = adapter.search("人工智能", platform="bili", limit=10)
    assert len(items) == 2
    first = next(i for i in items if i.platform_id == "1001")
    assert first.platform == Platform.BILIBILI
    assert first.account_platform_id == "90001"
    assert first.account_nickname == "UP主A"
    assert first.metrics[MetricType.VIEWS] == "12.3万"
