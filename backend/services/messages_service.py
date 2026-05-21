import time
import uuid
from typing import Dict, List, Optional, Tuple

from fastapi import HTTPException, status

from models.message import (
    ConversationSummary,
    MessageableClient,
    MessageItem,
)
from services.supabase_client import get_supabase


def _resolve_user(user_id: int) -> Tuple[int, int]:
    """Return (user_id, firm_id) for the authenticated user; raise if firm missing."""
    sb = get_supabase()
    resp = (
        sb.table("users")
        .select("id,firm_id")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    firm_id = rows[0].get("firm_id")
    if firm_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No firm associated.")
    return int(rows[0]["id"]), int(firm_id)


def _ensure_participant(conversation_id: str, user_id: int) -> dict:
    sb = get_supabase()
    resp = (
        sb.table("conversation_participants")
        .select("id,last_read_at")
        .eq("conversation_id", conversation_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a participant.")
    return rows[0]


def _attorney_owns_client(attorney_id: int, client_id: int) -> bool:
    sb = get_supabase()
    resp = (
        sb.table("cases")
        .select("id", count="exact")
        .eq("attorney_id", attorney_id)
        .eq("client_id", client_id)
        .limit(1)
        .execute()
    )
    return int(resp.count or 0) > 0


def list_conversations_for_user(user_id: int) -> List[ConversationSummary]:
    user_id, firm_id = _resolve_user(user_id)
    sb = get_supabase()

    parts_resp = (
        sb.table("conversation_participants")
        .select("conversation_id,last_read_at")
        .eq("user_id", user_id)
        .execute()
    )
    parts = parts_resp.data or []
    if not parts:
        return []

    conv_ids = [p["conversation_id"] for p in parts]
    last_read_by_conv: Dict[str, int] = {
        p["conversation_id"]: int(p.get("last_read_at") or 0) for p in parts
    }

    convs_resp = (
        sb.table("conversations")
        .select("id,client_id,created_at,updated_at,is_group")
        .in_("id", conv_ids)
        .eq("firm_id", firm_id)
        .order("updated_at", desc=True)
        .execute()
    )
    convs = convs_resp.data or []
    if not convs:
        return []

    client_ids = sorted({int(c["client_id"]) for c in convs if c.get("client_id") is not None})
    client_lookup: Dict[int, dict] = {}
    if client_ids:
        cl_resp = (
            sb.table("clients")
            .select("id,full_name,email")
            .in_("id", client_ids)
            .execute()
        )
        for c in cl_resp.data or []:
            client_lookup[int(c["id"])] = c

    msgs_resp = (
        sb.table("messages")
        .select("conversation_id,sender_user_id,body_text,created_at")
        .in_("conversation_id", conv_ids)
        .order("created_at", desc=True)
        .limit(1000)
        .execute()
    )
    msgs = msgs_resp.data or []

    last_by_conv: Dict[str, dict] = {}
    unread_by_conv: Dict[str, int] = {cid: 0 for cid in conv_ids}
    for m in msgs:
        cid = m["conversation_id"]
        if cid not in last_by_conv:
            last_by_conv[cid] = m
        if int(m.get("sender_user_id") or 0) != user_id:
            if int(m.get("created_at") or 0) > last_read_by_conv.get(cid, 0):
                unread_by_conv[cid] = unread_by_conv.get(cid, 0) + 1

    out: List[ConversationSummary] = []
    for c in convs:
        cid = c["id"]
        client = client_lookup.get(int(c["client_id"])) if c.get("client_id") is not None else None
        last = last_by_conv.get(cid)
        preview = None
        if last and last.get("body_text"):
            preview = last["body_text"]
            if len(preview) > 80:
                preview = preview[:80] + "..."
        out.append(
            ConversationSummary(
                id=cid,
                client_id=c.get("client_id"),
                client_name=(client.get("full_name") if client else None),
                client_email=(client.get("email") if client else None),
                last_message_preview=preview,
                last_message_at=(int(last["created_at"]) if last else None),
                unread_count=unread_by_conv.get(cid, 0),
                created_at=int(c["created_at"]),
                updated_at=int(c["updated_at"]),
            )
        )
    return out


def list_messageable_clients_for_attorney(attorney_id: int) -> List[MessageableClient]:
    """Clients the attorney has cases with AND who have signed into the mobile app
    (i.e. a `users` row exists with role='client' and last_logged_in IS NOT NULL).
    """
    sb = get_supabase()

    cases_resp = (
        sb.table("cases")
        .select("client_id")
        .eq("attorney_id", attorney_id)
        .execute()
    )
    client_ids = sorted({int(r["client_id"]) for r in (cases_resp.data or []) if r.get("client_id") is not None})
    if not client_ids:
        return []

    users_resp = (
        sb.table("users")
        .select("client_id,last_logged_in")
        .in_("client_id", client_ids)
        .eq("role", "client")
        .not_.is_("last_logged_in", "null")
        .execute()
    )
    last_by_client: Dict[int, str] = {}
    for u in users_resp.data or []:
        cid = u.get("client_id")
        if cid is None:
            continue
        last_by_client[int(cid)] = u.get("last_logged_in")

    if not last_by_client:
        return []

    clients_resp = (
        sb.table("clients")
        .select("id,full_name,email,phone,state")
        .in_("id", list(last_by_client.keys()))
        .order("full_name")
        .execute()
    )
    out: List[MessageableClient] = []
    for c in clients_resp.data or []:
        cid = int(c["id"])
        out.append(
            MessageableClient(
                id=cid,
                full_name=c.get("full_name") or "Unknown",
                email=c.get("email"),
                phone=c.get("phone"),
                state=c.get("state"),
                last_logged_in=last_by_client.get(cid),
            )
        )
    return out


def create_or_get_conversation(
    user_id: int, attorney_id: int, client_id: int
) -> ConversationSummary:
    user_id, firm_id = _resolve_user(user_id)

    if not _attorney_owns_client(attorney_id, client_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found.")

    sb = get_supabase()

    existing_resp = (
        sb.table("conversations")
        .select("id,client_id,created_at,updated_at")
        .eq("firm_id", firm_id)
        .eq("client_id", client_id)
        .or_("is_group.is.null,is_group.eq.0")
        .limit(1)
        .execute()
    )
    existing = (existing_resp.data or [])
    if existing:
        conv = existing[0]
        # Ensure attorney is a participant on this conversation (defensive — older convs may lack it).
        parts_resp = (
            sb.table("conversation_participants")
            .select("id")
            .eq("conversation_id", conv["id"])
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not (parts_resp.data or []):
            sb.table("conversation_participants").insert(
                {
                    "id": str(uuid.uuid4()),
                    "conversation_id": conv["id"],
                    "user_id": user_id,
                    "role": "attorney",
                    "last_read_at": int(time.time()),
                    "created_at": int(time.time()),
                }
            ).execute()
        return _hydrate_conversation(conv["id"], user_id)

    now = int(time.time())
    conv_id = str(uuid.uuid4())
    sb.table("conversations").insert(
        {
            "id": conv_id,
            "firm_id": firm_id,
            "client_id": client_id,
            "is_group": 0,
            "created_at": now,
            "updated_at": now,
        }
    ).execute()

    sb.table("conversation_participants").insert(
        {
            "id": str(uuid.uuid4()),
            "conversation_id": conv_id,
            "user_id": user_id,
            "role": "attorney",
            "last_read_at": now,
            "created_at": now,
        }
    ).execute()

    client_user_resp = (
        sb.table("users")
        .select("id")
        .eq("client_id", client_id)
        .limit(1)
        .execute()
    )
    client_user_rows = client_user_resp.data or []
    if client_user_rows:
        sb.table("conversation_participants").insert(
            {
                "id": str(uuid.uuid4()),
                "conversation_id": conv_id,
                "user_id": int(client_user_rows[0]["id"]),
                "role": "client",
                "last_read_at": 0,
                "created_at": now,
            }
        ).execute()

    return _hydrate_conversation(conv_id, user_id)


def _hydrate_conversation(conversation_id: str, user_id: int) -> ConversationSummary:
    sb = get_supabase()
    conv_resp = (
        sb.table("conversations")
        .select("id,client_id,created_at,updated_at")
        .eq("id", conversation_id)
        .limit(1)
        .execute()
    )
    rows = conv_resp.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    c = rows[0]

    client_name = None
    client_email = None
    if c.get("client_id") is not None:
        cl_resp = (
            sb.table("clients")
            .select("id,full_name,email")
            .eq("id", c["client_id"])
            .limit(1)
            .execute()
        )
        cl_rows = cl_resp.data or []
        if cl_rows:
            client_name = cl_rows[0].get("full_name")
            client_email = cl_rows[0].get("email")

    last_resp = (
        sb.table("messages")
        .select("body_text,created_at")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    last_rows = last_resp.data or []
    preview = None
    last_at = None
    if last_rows:
        last_at = int(last_rows[0]["created_at"])
        body = last_rows[0].get("body_text")
        if body:
            preview = body if len(body) <= 80 else body[:80] + "..."

    return ConversationSummary(
        id=c["id"],
        client_id=c.get("client_id"),
        client_name=client_name,
        client_email=client_email,
        last_message_preview=preview,
        last_message_at=last_at,
        unread_count=0,
        created_at=int(c["created_at"]),
        updated_at=int(c["updated_at"]),
    )


def list_messages_for_user(
    user_id: int, conversation_id: str, limit: int = 50, before: Optional[int] = None
) -> List[MessageItem]:
    user_id, firm_id = _resolve_user(user_id)
    _ensure_participant(conversation_id, user_id)

    sb = get_supabase()
    conv_resp = (
        sb.table("conversations")
        .select("id")
        .eq("id", conversation_id)
        .eq("firm_id", firm_id)
        .limit(1)
        .execute()
    )
    if not (conv_resp.data or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    q = (
        sb.table("messages")
        .select("id,conversation_id,sender_user_id,sender_role,body_text,message_type,created_at")
        .eq("conversation_id", conversation_id)
        .eq("firm_id", firm_id)
        .neq("message_type", "internal_note")
        .order("created_at", desc=True)
        .limit(min(max(limit, 1), 100))
    )
    if before is not None:
        q = q.lt("created_at", before)
    msgs_resp = q.execute()
    raw = list(msgs_resp.data or [])

    sender_ids = sorted({int(m["sender_user_id"]) for m in raw if m.get("sender_user_id") is not None})
    sender_lookup: Dict[int, str] = {}
    if sender_ids:
        users_resp = (
            sb.table("users")
            .select("id,full_name,email,client_id,attorney_id")
            .in_("id", sender_ids)
            .execute()
        )
        user_rows = users_resp.data or []
        # Try clients then attorneys for display name fallback.
        client_id_to_name: Dict[int, str] = {}
        attorney_id_to_name: Dict[int, str] = {}
        client_ids = [int(r["client_id"]) for r in user_rows if r.get("client_id") is not None]
        attorney_ids = [int(r["attorney_id"]) for r in user_rows if r.get("attorney_id") is not None]
        if client_ids:
            cl = sb.table("clients").select("id,full_name").in_("id", client_ids).execute()
            for r in cl.data or []:
                client_id_to_name[int(r["id"])] = r.get("full_name") or ""
        if attorney_ids:
            at = sb.table("attorneys").select("id,full_name").in_("id", attorney_ids).execute()
            for r in at.data or []:
                attorney_id_to_name[int(r["id"])] = r.get("full_name") or ""
        for r in user_rows:
            uid = int(r["id"])
            name = r.get("full_name")
            if not name and r.get("client_id") is not None:
                name = client_id_to_name.get(int(r["client_id"]))
            if not name and r.get("attorney_id") is not None:
                name = attorney_id_to_name.get(int(r["attorney_id"]))
            if not name:
                email = r.get("email") or ""
                name = email.split("@")[0] if email else None
            if name:
                sender_lookup[uid] = name

    out: List[MessageItem] = []
    for m in reversed(raw):
        out.append(
            MessageItem(
                id=m["id"],
                conversation_id=m["conversation_id"],
                sender_user_id=int(m["sender_user_id"]),
                sender_role=m.get("sender_role") or "unknown",
                sender_name=sender_lookup.get(int(m["sender_user_id"])),
                body_text=m.get("body_text"),
                message_type=m.get("message_type") or "text",
                created_at=int(m["created_at"]),
            )
        )
    return out


def send_message_for_user(
    user_id: int, conversation_id: str, body_text: str
) -> MessageItem:
    user_id, firm_id = _resolve_user(user_id)
    _ensure_participant(conversation_id, user_id)

    body = (body_text or "").strip()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message body is required.")

    sb = get_supabase()
    conv_resp = (
        sb.table("conversations")
        .select("id")
        .eq("id", conversation_id)
        .eq("firm_id", firm_id)
        .limit(1)
        .execute()
    )
    if not (conv_resp.data or []):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    now = int(time.time())
    message_id = str(uuid.uuid4())
    sb.table("messages").insert(
        {
            "id": message_id,
            "firm_id": firm_id,
            "conversation_id": conversation_id,
            "sender_user_id": user_id,
            "sender_role": "attorney",
            "body_text": body,
            "message_type": "text",
            "created_at": now,
        }
    ).execute()
    sb.table("conversations").update({"updated_at": now}).eq("id", conversation_id).execute()
    sb.table("conversation_participants").update({"last_read_at": now}).eq(
        "conversation_id", conversation_id
    ).eq("user_id", user_id).execute()

    return MessageItem(
        id=message_id,
        conversation_id=conversation_id,
        sender_user_id=user_id,
        sender_role="attorney",
        sender_name=None,
        body_text=body,
        message_type="text",
        created_at=now,
    )


def delete_conversation_for_user(user_id: int, conversation_id: str) -> None:
    """Hard-delete a conversation and all its messages/participants. Attorney-only.

    Refuses if the conversation is on legal hold. The caller must be a participant.
    """
    user_id, firm_id = _resolve_user(user_id)
    _ensure_participant(conversation_id, user_id)

    sb = get_supabase()
    conv_resp = (
        sb.table("conversations")
        .select("id,legal_hold")
        .eq("id", conversation_id)
        .eq("firm_id", firm_id)
        .limit(1)
        .execute()
    )
    rows = conv_resp.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    legal_hold = rows[0].get("legal_hold")
    if legal_hold and int(legal_hold) != 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This conversation is on legal hold and cannot be deleted.",
        )

    sb.table("message_attachments").delete().eq("conversation_id", conversation_id).execute()
    sb.table("messages").delete().eq("conversation_id", conversation_id).execute()
    sb.table("conversation_participants").delete().eq("conversation_id", conversation_id).execute()
    sb.table("conversations").delete().eq("id", conversation_id).eq("firm_id", firm_id).execute()


def mark_conversation_read(user_id: int, conversation_id: str) -> None:
    user_id, _ = _resolve_user(user_id)
    _ensure_participant(conversation_id, user_id)
    sb = get_supabase()
    sb.table("conversation_participants").update({"last_read_at": int(time.time())}).eq(
        "conversation_id", conversation_id
    ).eq("user_id", user_id).execute()
