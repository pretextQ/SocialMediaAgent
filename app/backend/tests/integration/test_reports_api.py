"""周报读取接口集成测试（GET /reports、GET /reports/{name}）。

覆盖：目录不存在返回空数组、按修改时间倒序、UTF-8 正文、404、
以及**目录穿越**防护（这是本接口的主要风险面）。
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from socialmedia_agent.api.main import create_app
from socialmedia_agent.config import Settings, get_settings
from socialmedia_agent.database.session import Database


def _client(tmp_path: Path, report_dir: Path) -> TestClient:
    db = Database(url=f"sqlite:///{tmp_path / 'reports.db'}")
    app = create_app(database=db)
    # 用依赖覆盖注入临时 report_dir，避免测试读取真实 data/reports
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None, report_dir=str(report_dir)
    )
    return TestClient(app)


def test_list_reports_empty_when_dir_missing(tmp_path):
    with _client(tmp_path, tmp_path / "no_such_dir") as client:
        resp = client.get("/api/v1/reports")
    assert resp.status_code == 200
    assert resp.json() == {"reports": []}


def test_list_reports_sorted_by_modified_desc_and_only_md(tmp_path):
    d = tmp_path / "reports"
    d.mkdir()
    (d / "old.md").write_text("old", encoding="utf-8")
    (d / "new.md").write_text("newer", encoding="utf-8")
    (d / "ignored.txt").write_text("skip", encoding="utf-8")
    os.utime(d / "old.md", (1_700_000_000, 1_700_000_000))
    os.utime(d / "new.md", (1_800_000_000, 1_800_000_000))

    with _client(tmp_path, d) as client:
        body = client.get("/api/v1/reports").json()

    assert [r["name"] for r in body["reports"]] == ["new.md", "old.md"]
    assert body["reports"][0]["size"] == len("newer")
    assert body["reports"][0]["modified_at"]  # ISO 字符串非空
    assert "T" in body["reports"][0]["modified_at"]


def test_get_report_returns_utf8_content(tmp_path):
    d = tmp_path / "reports"
    d.mkdir()
    name = "weekly_bilibili_90001_2026-09-13.md"
    (d / name).write_text("# 运营周报：UP主A\n\n- 本周发布 1 条\n", encoding="utf-8")

    with _client(tmp_path, d) as client:
        resp = client.get(f"/api/v1/reports/{name}")

    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == name
    assert "运营周报" in body["content"]
    assert "本周发布 1 条" in body["content"]


def test_get_report_404_when_missing(tmp_path):
    d = tmp_path / "reports"
    d.mkdir()
    with _client(tmp_path, d) as client:
        resp = client.get("/api/v1/reports/nope.md")
    assert resp.status_code == 404


@pytest.mark.parametrize(
    "name",
    [
        "..",
        "../secret.md",
        "..%2Fsecret.md",
        "..\\secret.md",
        "a/b.md",
        "sub/nested.md",
        "C:\\windows\\win.ini",
    ],
)
def test_get_report_rejects_path_traversal(tmp_path, name):
    """目录穿越必须被挡住：既不能读到 report_dir 外的文件，也不能返回其内容。"""
    d = tmp_path / "reports"
    d.mkdir()
    (tmp_path / "secret.md").write_text("TOP-SECRET", encoding="utf-8")

    with _client(tmp_path, d) as client:
        resp = client.get(f"/api/v1/reports/{name}")

    assert resp.status_code == 404
    assert "TOP-SECRET" not in resp.text


def test_nested_report_file_is_not_reachable(tmp_path):
    """合法存在但位于子目录的文件，不通过 {name} 暴露（只服务 report_dir 顶层）。"""
    d = tmp_path / "reports"
    (d / "sub").mkdir(parents=True)
    (d / "sub" / "inner.md").write_text("inner", encoding="utf-8")

    with _client(tmp_path, d) as client:
        assert client.get("/api/v1/reports/inner.md").status_code == 404
        assert client.get("/api/v1/reports/sub/inner.md").status_code == 404
