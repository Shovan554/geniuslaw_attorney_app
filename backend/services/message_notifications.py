"""Tell a client their attorney messaged them.

Writes one client_notifications row. The Geniuslaw_Clients backend's
notification_dispatcher polls that table (pushed_at IS NULL) and sends the Expo
push; the client app routes link_type "message" to its Messages tab.

link_id stays NULL: it is an integer column and conversation ids are uuids.
A client has one conversation per firm, so the Messages tab is the right
landing spot anyway.

Best-effort by design — a failed bell must never fail the message send.
"""

import logging
from typing import Optional

logger = logging.getLogger("message_notifications")

PREVIEW_MAX = 200
GENERIC_SENDER = "your attorney"


def message_preview(body: str) -> str:
    text = " ".join((body or "").split())
    if len(text) <= PREVIEW_MAX:
        return text
    return text[: PREVIEW_MAX - 1].rstrip() + "…"


def _attorney_display_name(sb, user_id: int) -> str:
    rows = (
        sb.table("users")
        .select("full_name,email,attorney_id")
        .eq("id", int(user_id))
        .limit(1)
        .execute()
        .data
        or []
    )
    if not rows:
        return GENERIC_SENDER
    user = rows[0]
    if (user.get("full_name") or "").strip():
        return user["full_name"].strip()

    # Same resolution order as require_attorney_id: FK first, then email.
    att_rows = []
    if user.get("attorney_id") is not None:
        att_rows = (
            sb.table("attorneys").select("full_name").eq("id", int(user["attorney_id"])).limit(1).execute().data
            or []
        )
    if not att_rows and user.get("email"):
        att_rows = (
            sb.table("attorneys")
            .select("full_name")
            .eq("email", user["email"].strip().lower())
            .limit(1)
            .execute()
            .data
            or []
        )
    name = (att_rows[0].get("full_name") or "").strip() if att_rows else ""
    return name or GENERIC_SENDER


def notify_client_of_message(
    sb, client_id: Optional[int], sender_user_id: int, body: str
) -> bool:
    """Queue the client's push for a new attorney message. Returns True if queued."""
    if client_id is None:
        return False
    try:
        sender = _attorney_display_name(sb, sender_user_id)
        sb.table("client_notifications").insert(
            {
                "client_id": int(client_id),
                "genre": "message",
                "short_description": f"New message from {sender}",
                "long_description": message_preview(body),
                "link_type": "message",
                "link_id": None,
            }
        ).execute()
        return True
    except Exception:
        logger.exception("could not queue message notification for client %s", client_id)
        return False
