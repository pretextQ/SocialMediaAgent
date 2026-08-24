"""熔断器：防止 LLM 服务雪崩（ADR-0002 重新实现）。

状态机 CLOSED → OPEN → HALF_OPEN → CLOSED。
参考 MediaRadar `core/circuit_breaker.py` 思路，去掉 Prometheus 耦合。
"""

from __future__ import annotations

import time
from enum import Enum


class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreakerOpen(Exception):
    """熔断器开启异常。"""


class CircuitBreaker:
    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self._failures = 0
        self._state = CircuitState.CLOSED
        self._last_failure_time: float = 0.0

    @property
    def state(self) -> str:
        return self._state.value

    def call(self, fn, *args, **kwargs):
        """受熔断保护地调用 fn；OPEN 时短路抛 CircuitBreakerOpen。"""
        if self._state == CircuitState.OPEN:
            if time.time() - self._last_failure_time > self.recovery_timeout:
                self._set_state(CircuitState.HALF_OPEN)
            else:
                raise CircuitBreakerOpen(
                    f"Circuit {self.name} is OPEN (retry after {self.recovery_timeout}s)"
                )
        try:
            result = fn(*args, **kwargs)
            self._on_success()
            return result
        except Exception:
            self._on_failure()
            raise

    def _set_state(self, new_state: CircuitState) -> None:
        self._state = new_state

    def _on_success(self) -> None:
        self._failures = 0
        if self._state == CircuitState.HALF_OPEN:
            self._set_state(CircuitState.CLOSED)

    def _on_failure(self) -> None:
        self._failures += 1
        self._last_failure_time = time.time()
        if self._failures >= self.failure_threshold:
            self._set_state(CircuitState.OPEN)

    def record_failure(self) -> None:
        self._on_failure()

    def record_success(self) -> None:
        self._on_success()

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "state": self.state,
            "failures": self._failures,
            "threshold": self.failure_threshold,
            "recovery_timeout": self.recovery_timeout,
            "last_failure_time": self._last_failure_time,
        }
