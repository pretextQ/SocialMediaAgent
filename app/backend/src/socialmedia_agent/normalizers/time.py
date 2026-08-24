"""时间归一：ISO 字符串 / unix 秒 / unix 毫秒 → 时区感知 datetime。"""

from __future__ import annotations

from datetime import datetime, timezone

from .base import TimeNormalizer


class DefaultTimeNormalizer(TimeNormalizer):
    def normalize(self, raw: object) -> datetime | None:
        if raw is None:
            return None
        if isinstance(raw, datetime):
            return raw

        s = str(raw).strip()
        if not s:
            return None

        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            pass

        try:
            ts = float(s)
        except ValueError:
            return None

        if ts > 10**12:
            ts = ts / 1000
        try:
            return datetime.fromtimestamp(ts, tz=timezone.utc)
        except (ValueError, OverflowError, OSError):
            return None
