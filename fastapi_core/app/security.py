"""Request hardening for the NLP service (IAS Phase 10 H).

- Payload size limit: requests over CATEGORAIZE_MAX_BODY_BYTES (default 4 MB,
  enough for 200 label centroids) get 413; POSTs without Content-Length get 411.
- Per-client rate limit: CATEGORAIZE_RATE_LIMIT_PER_MINUTE (default 1200; 0
  turns it off) over a sliding 60 s window, 429 with Retry-After. /healthz is
  exempt so load balancers can always probe it.
- Failed X-Internal-Key checks are counted (shown on /healthz) and logged
  without the presented key.
- No CORS middleware is installed on purpose: browsers cannot call the
  service directly; only the web app's server does.
"""

import logging
import os
import threading
import time
from collections import defaultdict, deque

from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger("categoraize.security")

DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024
DEFAULT_RATE_LIMIT_PER_MINUTE = 1200
WINDOW_SECONDS = 60.0
EXEMPT_PATHS = {"/healthz"}


def max_body_bytes() -> int:
    return int(os.getenv("CATEGORAIZE_MAX_BODY_BYTES", DEFAULT_MAX_BODY_BYTES))


def rate_limit_per_minute() -> int:
    return int(os.getenv("CATEGORAIZE_RATE_LIMIT_PER_MINUTE", DEFAULT_RATE_LIMIT_PER_MINUTE))


class AuthFailureCounter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.count = 0

    def record(self) -> int:
        with self._lock:
            self.count += 1
            count = self.count
        # Never log the presented key or the request body.
        logger.warning("Rejected a request without a valid X-Internal-Key (total %d)", count)
        return count


class RateLimiter:
    """Sliding-window limiter per client address, in memory (one process)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def check(self, client: str, limit: int, now: float | None = None) -> float | None:
        """None when allowed, else the seconds until the next request is allowed."""
        if limit <= 0:
            return None
        now = time.monotonic() if now is None else now
        with self._lock:
            hits = self._hits[client]
            while hits and now - hits[0] >= WINDOW_SECONDS:
                hits.popleft()
            if len(hits) >= limit:
                return max(1.0, WINDOW_SECONDS - (now - hits[0]))
            hits.append(now)
            return None


auth_failures = AuthFailureCounter()
rate_limiter = RateLimiter()


async def harden_request(request: Request, call_next) -> Response:
    if request.url.path not in EXEMPT_PATHS:
        client = request.client.host if request.client else "unknown"
        retry_after = rate_limiter.check(client, rate_limit_per_minute())
        if retry_after is not None:
            return JSONResponse(
                status_code=429,
                content={"detail": "rate limit exceeded"},
                headers={"Retry-After": str(int(retry_after))},
            )

    if request.method in {"POST", "PUT", "PATCH"}:
        length = request.headers.get("content-length")
        if length is None:
            return JSONResponse(status_code=411, content={"detail": "Content-Length required"})
        try:
            size = int(length)
        except ValueError:
            return JSONResponse(status_code=400, content={"detail": "invalid Content-Length"})
        if size > max_body_bytes():
            return JSONResponse(status_code=413, content={"detail": "payload too large"})

    return await call_next(request)
