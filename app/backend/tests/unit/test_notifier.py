"""报告投递通道测试（P7）。

重点验证三件事：
1. **默认不投递**（未配置 URL 时 registry 为空）；
2. webhook 载荷正确，且失败时返回 False 而不是抛异常；
3. **单通道失败不影响其他通道** —— 周报已落盘，投递只是旁路。
"""

from __future__ import annotations

from socialmedia_agent.config import Settings
from socialmedia_agent.services.notifier import (
    FileNotifier,
    Notifier,
    NotifierRegistry,
    WebhookNotifier,
    build_notifier_registry,
)

HOOK = "https://example.com/hook"


class _RecordingTransport:
    """可注入的传输桩：记录调用，可选失败。"""

    def __init__(self, fail: bool = False):
        self.calls: list[tuple[str, dict]] = []
        self.fail = fail

    def __call__(self, url: str, payload: dict) -> None:
        self.calls.append((url, payload))
        if self.fail:
            raise RuntimeError("boom")


class _BrokenNotifier(Notifier):
    name = "broken"

    def send(self, *, title: str, markdown: str) -> bool:
        raise RuntimeError("实现约定不该抛，但兜底必须挡住")


def test_no_config_means_no_channels():
    registry = build_notifier_registry(Settings(_env_file=None))
    assert registry.channels == []
    assert not registry, "空 registry 必须为假值，避免调用方误以为有通道"


def test_webhook_registered_only_when_url_configured():
    registry = build_notifier_registry(
        Settings(_env_file=None, notify_webhook_url=HOOK)
    )
    assert registry.channels == ["webhook"]
    assert bool(registry)


def test_webhook_posts_expected_payload():
    transport = _RecordingTransport()
    notifier = WebhookNotifier(HOOK, transport=transport)
    assert notifier.send(title="weekly_a.md", markdown="# 标题") is True
    url, payload = transport.calls[0]
    assert url == HOOK
    assert payload == {
        "source": "socialmedia-agent",
        "name": "weekly_a.md",
        "markdown": "# 标题",
    }


def test_webhook_failure_returns_false_without_raising():
    notifier = WebhookNotifier(HOOK, transport=_RecordingTransport(fail=True))
    assert notifier.send(title="x.md", markdown="y") is False


def test_file_notifier_writes_file(tmp_path):
    notifier = FileNotifier(str(tmp_path / "reports"))
    assert notifier.send(title="weekly_a.md", markdown="# 内容") is True
    assert (tmp_path / "reports" / "weekly_a.md").read_text(encoding="utf-8") == "# 内容"


def test_registry_isolates_failing_channel(tmp_path):
    """单通道失败不影响其他通道，结果逐通道返回。"""
    registry = NotifierRegistry([_BrokenNotifier(), FileNotifier(str(tmp_path / "r"))])
    results = registry.send_all(title="a.md", markdown="b")
    assert results == {"broken": False, "file": True}
    assert (tmp_path / "r" / "a.md").exists()
