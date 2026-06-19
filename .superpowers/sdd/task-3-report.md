# Task 3 Report — `/test/start` + `/test/call` endpoints + hide test notifications

**Status: COMPLETE — all verifications passed.**

---

## Files Modified

### 1. `/Users/shovansmini/codes/Pronto/backend/routers/attorney_pronto.py`

**Imports added** (after `import logging`, alongside existing service imports):
```python
import uuid
from services.calls_service import create_test_call_room
from services.pronto_test import build_test_notification, build_test_start_response
from services.pronto_test import TEST_CLIENT_NAME
```

**Endpoints appended** at end of file (after `list_transactions`):
- Pydantic models: `TestStartResponse`, `TestCallRequest`, `TestCallResponse`
- `POST /attorney/pronto/test/start` (`start_test_call`) — inserts one `attorney_notifications` row (genre `pronto_test`), returns dummy request payload with a fresh UUID call_id.
- `POST /attorney/pronto/test/call` (`start_test_call_room`) — looks up attorney's `full_name`, calls `create_test_call_room`, returns Daily room URL + token + `TEST_CLIENT_NAME`. No DB writes.

### 2. `/Users/shovansmini/codes/Pronto/backend/routers/attorney_notifications.py`

**Notification filter added** in `list_my_notifications` query chain, immediately after `.is_("dismissed_at", "null")`:
```python
        .neq("genre", "pronto_test")
```

---

## Unread-Count Query Investigation

No unread-count query exists in `attorney_notifications.py`. The file has four references to `attorney_notifications`:
- Line 224: `list_my_notifications` — the list query (filter applied here).
- Line 241: `_owned_notification_or_404` — single-row lookup by ID (used for read/dismiss; not a list, no filter needed).
- Lines 262, 276: `.update(...)` calls for mark-read and dismiss mutations.

There is no separate unread-count endpoint or query in this file. No additional `.neq` was needed.

---

## Verification

```
cd /Users/shovansmini/codes/Pronto/backend && \
  venv/bin/python -c "import routers.attorney_pronto, routers.attorney_notifications"
# → no output (clean import)

venv/bin/python -m pytest -q
# → 66 passed in 0.32s
```

Both commands succeeded with zero errors.

---

## Concerns

None. The implementation matches the plan verbatim. `int | None` union syntax is consistent with existing usage in the file. `get_supabase` and `require_attorney` were already imported. The `.neq` placement is correctly between `.is_("dismissed_at", "null")` and `.order(...)`, which is the exact spot specified in the plan.
