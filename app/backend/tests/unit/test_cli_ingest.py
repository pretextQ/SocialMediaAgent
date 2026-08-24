"""CLI ingest 命令测试（mock IngestService，不触发真实采集）。"""

import pytest

from socialmedia_agent.cli.ingest import main
from socialmedia_agent.services.ingest import IngestResult


def _patch_service(monkeypatch, result: IngestResult):
    class FakeService:
        def __init__(self, *args, **kwargs):
            self.result = result

        def ingest_search(self, keyword, platform="bili", limit=10):
            return self.result

    class FakeConnector:
        def __init__(self, *args, **kwargs):
            pass

    monkeypatch.setattr("socialmedia_agent.cli.ingest.IngestService", FakeService)
    monkeypatch.setattr("socialmedia_agent.cli.ingest.MediaCrawlerConnector", FakeConnector)


def test_main_runs_and_reports(monkeypatch, capsys, tmp_path):
    _patch_service(
        monkeypatch,
        IngestResult(keyword="人工智能", platform="bili", account_count=1, content_count=2, metric_count=3),
    )
    code = main(["--keyword", "人工智能", "--platform", "bili", "--limit", "5", "--db-url", f"sqlite:///{tmp_path}/cli.db"])
    assert code == 0
    out = capsys.readouterr().out
    assert "keyword=人工智能" in out
    assert "contents=2" in out
    assert "metrics=3" in out


def test_main_requires_keyword():
    with pytest.raises(SystemExit) as exc:
        main([])
    assert exc.value.code == 2  # argparse 用法错误


def test_main_reports_crawler_failure(monkeypatch, capsys, tmp_path):
    from socialmedia_agent.connectors.mediacrawler.runner import MediaCrawlerRunError

    class FailingService:
        def __init__(self, *args, **kwargs):
            pass

        def ingest_search(self, keyword, platform="bili", limit=10):
            raise MediaCrawlerRunError("解释器不存在")

    class FakeConnector:
        def __init__(self, *args, **kwargs):
            pass

    monkeypatch.setattr("socialmedia_agent.cli.ingest.IngestService", FailingService)
    monkeypatch.setattr("socialmedia_agent.cli.ingest.MediaCrawlerConnector", FakeConnector)
    code = main(["--keyword", "人工智能", "--db-url", f"sqlite:///{tmp_path}/cli.db"])
    assert code == 1
    assert "采集失败" in capsys.readouterr().err
