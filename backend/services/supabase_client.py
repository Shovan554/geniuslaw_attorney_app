import os
import time
from typing import Optional

import httpx
from supabase import Client, create_client


class _SafeRetryTransport(httpx.HTTPTransport):
    """Retry idempotent HTTP requests on transient socket errors.

    Pooled Supabase connections can go stale on long-running workers. POST is
    excluded so we never accidentally double-write.
    """

    _IDEMPOTENT = frozenset({"GET", "HEAD", "OPTIONS", "PUT", "PATCH", "DELETE"})
    _TRANSIENT = (
        httpx.ReadError,
        httpx.RemoteProtocolError,
        httpx.WriteError,
        httpx.PoolTimeout,
    )

    def __init__(self, *args, max_retries: int = 2, base_delay: float = 0.2, **kwargs):
        super().__init__(*args, **kwargs)
        self._max_retries = max_retries
        self._base_delay = base_delay

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        last_exc: Optional[BaseException] = None
        for attempt in range(self._max_retries + 1):
            try:
                return super().handle_request(request)
            except httpx.ConnectError as exc:
                last_exc = exc
                if attempt == self._max_retries:
                    raise
            except self._TRANSIENT as exc:
                last_exc = exc
                if request.method not in self._IDEMPOTENT or attempt == self._max_retries:
                    raise
            time.sleep(self._base_delay * (2 ** attempt))
        raise last_exc  # pragma: no cover


_client: Optional[Client] = None


def _install_retry_transport(client: Client) -> None:
    old = client.postgrest.session
    new_session = httpx.Client(
        base_url=old.base_url,
        headers=old.headers,
        timeout=old.timeout,
        transport=_SafeRetryTransport(),
    )
    try:
        old.close()
    except Exception:
        pass
    client.postgrest.session = new_session


def get_supabase() -> Client:
    global _client
    if _client is None:
        _client = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SERVICE_KEY"],
        )
        _install_retry_transport(_client)
    return _client


def reset_supabase() -> None:
    global _client
    if _client is not None:
        try:
            _client.postgrest.session.close()
        except Exception:
            pass
        _client = None
