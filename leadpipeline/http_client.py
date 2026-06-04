"""Thin JSON REST helper around requests, with rate limiting + retries."""
from __future__ import annotations

import logging
import random
import threading
import time
from typing import Any, Dict, Optional

import requests

log = logging.getLogger("http")


class RateLimiter:
    """Token-bucket limiter: at most `rate` calls per `per` seconds.

    Thread-safe so it works under the FastAPI worker too.
    """

    def __init__(self, rate: float, per: float = 1.0):
        self.rate = max(rate, 0.0)
        self.per = per
        self._allowance = rate
        self._last = time.monotonic()
        self._lock = threading.Lock()

    def acquire(self) -> None:
        if self.rate <= 0:
            return
        with self._lock:
            now = time.monotonic()
            elapsed = now - self._last
            self._last = now
            self._allowance = min(self.rate, self._allowance + elapsed * (self.rate / self.per))
            if self._allowance < 1.0:
                sleep_for = (1.0 - self._allowance) * (self.per / self.rate)
                time.sleep(sleep_for)
                self._allowance = 0.0
            else:
                self._allowance -= 1.0


# status codes worth retrying
_RETRY_STATUS = {408, 429, 500, 502, 503, 504}


class HTTPClient:
    def __init__(self, base_url: str, headers: Optional[Dict[str, str]] = None,
                 timeout: int = 30, max_retries: int = 4,
                 backoff_base: float = 0.5, backoff_max: float = 30.0,
                 rate_per_sec: float = 0.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self.backoff_base = backoff_base
        self.backoff_max = backoff_max
        self.limiter = RateLimiter(rate_per_sec) if rate_per_sec > 0 else None
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "Accept": "application/json",
        })
        if headers:
            self.session.headers.update(headers)

    def _sleep_for(self, attempt: int, retry_after: Optional[str]) -> float:
        # honor server's Retry-After if present
        if retry_after:
            try:
                return min(float(retry_after), self.backoff_max)
            except ValueError:
                pass
        # exponential backoff with full jitter
        exp = min(self.backoff_base * (2 ** attempt), self.backoff_max)
        return random.uniform(0, exp)

    def do_json(self, method: str, path: str,
                body: Optional[Any] = None,
                extra_headers: Optional[Dict[str, str]] = None) -> Any:
        url = self.base_url + path
        last_err: Optional[Exception] = None

        for attempt in range(self.max_retries + 1):
            if self.limiter:
                self.limiter.acquire()
            try:
                resp = self.session.request(
                    method, url,
                    json=body if body is not None else None,
                    headers=extra_headers or None,
                    timeout=self.timeout,
                )
            except requests.RequestException as e:
                last_err = e
                if attempt < self.max_retries:
                    delay = self._sleep_for(attempt, None)
                    log.warning("%s %s network error (%s); retry %d in %.1fs",
                                method, path, e, attempt + 1, delay)
                    time.sleep(delay)
                    continue
                raise RuntimeError(f"{method} {path} failed: {e}") from e

            if 200 <= resp.status_code < 300:
                return resp.json() if resp.text else None

            # retryable status?
            if resp.status_code in _RETRY_STATUS and attempt < self.max_retries:
                delay = self._sleep_for(attempt, resp.headers.get("Retry-After"))
                log.warning("%s %s -> %d; retry %d in %.1fs",
                            method, path, resp.status_code, attempt + 1, delay)
                time.sleep(delay)
                continue

            raise RuntimeError(
                f"{method} {path} -> {resp.status_code}: {resp.text}"
            )

        raise RuntimeError(f"{method} {path} exhausted retries: {last_err}")
