"""数值归一：处理 "12.3万"/"1.2亿"/"1,234"/"--" 等平台口径。"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

from .base import NumberNormalizer

_CJK_UNITS = {"": Decimal("1"), "万": Decimal("10000"), "亿": Decimal("100000000")}
_LATIN_UNITS = {"k": Decimal("1000"), "w": Decimal("10000"), "m": Decimal("1000000")}
_EMPTY_MARKERS = {"--", "-", "—", "暂无", "none", "null", "nan"}

_NUMBER_RE = re.compile(r"([+-]?[\d.]+)\s*([万亿kwm]?)", re.IGNORECASE)


class DefaultNumberNormalizer(NumberNormalizer):
    """通用数值归一：整/浮点/带单位字符串。"""

    def normalize(self, raw: object) -> Decimal | None:
        if raw is None:
            return None
        if isinstance(raw, Decimal):
            return raw
        if isinstance(raw, bool):
            return Decimal(1) if raw else Decimal(0)
        if isinstance(raw, (int, float)):
            try:
                return Decimal(str(raw))
            except InvalidOperation:
                return None

        s = str(raw).strip()
        if not s:
            return None
        if s.lower() in _EMPTY_MARKERS:
            return None

        s = s.replace(",", "")
        match = _NUMBER_RE.fullmatch(s)
        if not match:
            return None
        try:
            num = Decimal(match.group(1))
        except InvalidOperation:
            return None
        unit = match.group(2).lower()
        multiplier = _CJK_UNITS.get(unit) or _LATIN_UNITS.get(unit) or Decimal("1")
        return num * multiplier
