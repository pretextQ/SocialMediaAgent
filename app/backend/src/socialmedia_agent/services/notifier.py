"""报告投递通道（P7）。

借鉴 MediaRadar `radar_service/notifier/` 的抽象手法（抽象基类 + registry + 逐通道容错），
但刻意**做最小**：不引入 SMTP / IM SDK，只提供「文件」与「Webhook」两种。

设计约束：

- **默认关闭**：未配置 `SMA_NOTIFY_WEBHOOK_URL` 时不注册任何通道；
- **拒绝退化**：`build_notifier_registry` 拿不到配置就返回空 registry，
  绝不「加载全部通道」（MediaRadar 的 `load_configs(None)` 在这一点上是很好的示范）；
- **单通道失败不影响其他**：逐个投递并收集结果；投递失败只记录、不抛给调用方——
  周报已经落盘，投递失败不该让整批生成失败。

安全：日志只记通道名与成败，**不记录报告正文与完整 URL**。
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from abc import ABC, abstractmethod
from collections.abc import Callable, Iterable
from pathlib import Path

from socialmedia_agent.config import Settings, get_settings

logger = logging.getLogger(__name__)

# 可注入的传输函数：(url, payload) -> None；默认用 urllib，不引入新依赖
Transport = Callable[[str, dict], None]


def _urllib_transport(url: str, payload: dict) -> None:
    """默认传输：POST JSON。超时固定 10s，避免投递拖住周报生成。"""
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        url, data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(request, timeout=10):
        pass


class Notifier(ABC):
    """一个投递通道。"""

    name: str

    @abstractmethod
    def send(self, *, title: str, markdown: str) -> bool:
        """投递一份报告，返回是否成功。约定：实现不向调用方抛异常。"""


class FileNotifier(Notifier):
    """写文件通道：把报告落到指定目录（当前 default 行为的显式化）。"""

    name = "file"

    def __init__(self, directory: str):
        self.directory = Path(directory)

    def send(self, *, title: str, markdown: str) -> bool:
        try:
            self.directory.mkdir(parents=True, exist_ok=True)
            (self.directory / title).write_text(markdown, encoding="utf-8")
        except OSError as exc:
            logger.warning("FileNotifier 写入失败 type=%s", type(exc).__name__)
            return False
        return True


class WebhookNotifier(Notifier):
    """Webhook 通道：POST JSON 到指定 URL。**默认不注册**，需显式配置。"""

    name = "webhook"

    def __init__(self, url: str, transport: Transport | None = None):
        self.url = url
        self._transport = transport or _urllib_transport

    def send(self, *, title: str, markdown: str) -> bool:
        payload = {"source": "socialmedia-agent", "name": title, "markdown": markdown}
        try:
            self._transport(self.url, payload)
        except Exception as exc:  # noqa: BLE001 - 投递失败不得影响周报生成
            logger.warning("WebhookNotifier 投递失败 type=%s", type(exc).__name__)
            return False
        return True


class NotifierRegistry:
    """已装配通道的集合：逐个投递并返回每个通道的成败。"""

    def __init__(self, notifiers: Iterable[Notifier] = ()):
        self._notifiers: list[Notifier] = list(notifiers)

    @property
    def channels(self) -> list[str]:
        return [n.name for n in self._notifiers]

    def __bool__(self) -> bool:
        return bool(self._notifiers)

    def send_all(self, *, title: str, markdown: str) -> dict[str, bool]:
        """向全部通道投递；单个通道失败不影响其他通道。"""
        results: dict[str, bool] = {}
        for notifier in self._notifiers:
            try:
                results[notifier.name] = notifier.send(title=title, markdown=markdown)
            except Exception as exc:  # noqa: BLE001 - 实现约定不抛，但别让它拖垮整批
                logger.warning(
                    "通道 %s 抛出异常 type=%s", notifier.name, type(exc).__name__
                )
                results[notifier.name] = False
        return results


def build_notifier_registry(settings: Settings | None = None) -> NotifierRegistry:
    """按配置装配通道。

    当前只支持 webhook，且**未配置 URL 时返回空 registry**（默认关闭）。
    文件落盘仍由 generate_all_weekly_reports 负责，不在这里重复一遍。
    """
    s = settings or get_settings()
    if not s.notify_webhook_url:
        return NotifierRegistry()
    return NotifierRegistry([WebhookNotifier(s.notify_webhook_url)])
