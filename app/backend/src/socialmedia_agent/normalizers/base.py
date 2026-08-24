"""Normalizer 抽象接口。

职责：把平台原始值（字符串/时间戳/平台ID）归一为统一领域表示。
数值 → Decimal；时间 → 时区感知 datetime；ID → canonical_id（复用 domain/identity）。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from decimal import Decimal


class NumberNormalizer(ABC):
    @abstractmethod
    def normalize(self, raw: object) -> Decimal | None:
        """归一数值；无法解析返回 None。"""


class TimeNormalizer(ABC):
    @abstractmethod
    def normalize(self, raw: object) -> datetime | None:
        """归一时间；无法解析返回 None。"""
