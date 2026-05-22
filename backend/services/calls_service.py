import os
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

import httpx
from fastapi import HTTPException

from models.call import (
    AcceptCallResponse,
    CallHistoryItem,
    CallableClient,
    InitiateCallResponse,
)
from services.supabase_client import get_supabase


DAILY_API_KEY = os.getenv("DAILY_API_KEY", "")
DAILY_DOMAIN = os.getenv("DAILY_DOMAIN", "")
DAILY_API_BASE = os.getenv("DAILY_API_BASE", "https://api.daily.co/v1")
DAILY_TOKEN_TTL = int(os.getenv("DAILY_MEETING_TOKEN_TTL_SECONDS", "3600"))

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

ROOM_TTL_SECONDS = 2 * 60 * 60


def _broadcast(topic: str, event: str, payload: dict) -> None:
    """Send a Realtime broadcast via the HTTP /realtime/v1/api/broadcast endpoint.

    The previous implementation called the realtime.send() Postgres function via
    PostgREST, but Supabase only exposes the public/graphql_public schemas, so
    that path returns PGRST106. Best-effort; never raises.
    """
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        print(f"[broadcast] SKIP topic={topic}: SUPABASE creds missing", flush=True)
        return
    try:
        with httpx.Client(timeout=5.0) as client:
            r = client.post(
                f"{SUPABASE_URL}/realtime/v1/api/broadcast",
                headers={
                    "apikey": SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "messages": [
                        {
                            "topic": topic,
                            "event": event,
                            "payload": payload,
                            "private": False,
                        }
                    ]
                },
            )
        if r.is_success:
            print(f"[broadcast] sent topic={topic} event={event}", flush=True)
        else:
            print(
                f"[broadcast] HTTP {r.status_code} topic={topic}: {r.text}",
                flush=True,
            )
    except Exception as e:
        print(f"[broadcast] EXCEPTION topic={topic}: {e!r}", flush=True)


def _daily_headers() -> Dict[str, str]:
    if not DAILY_API_KEY:
        raise HTTPException(status_code=500, detail="DAILY_API_KEY not configured.")
    return {
        "Authorization": f"Bearer {DAILY_API_KEY}",
        "Content-Type": "application/json",
    }


def _create_daily_room(is_video: bool = False) -> Dict[str, str]:
    """Create a Daily room with the constraints we want; returns {name, url}."""
    body = {
        "name": f"call-{uuid.uuid4().hex[:12]}",
        "properties": {
            "exp": int(time.time()) + ROOM_TTL_SECONDS,
            "max_participants": 2,
            "start_audio_off": False,
            "start_video_off": not is_video,
            "enable_screenshare": False,
            "enable_chat": False,
            "enable_prejoin_ui": False,
        },
    }
    with httpx.Client(timeout=10.0) as client:
        r = client.post(f"{DAILY_API_BASE}/rooms", json=body, headers=_daily_headers())
    if not r.is_success:
        raise HTTPException(status_code=502, detail=f"Daily room create failed: {r.text}")
    data = r.json()
    return {"name": data["name"], "url": data["url"]}


def _mint_meeting_token(room_name: str, user_name: str) -> str:
    """Short-lived token granting one participant access to one room."""
    body = {
        "properties": {
            "room_name": room_name,
            "user_name": user_name,
            "exp": int(time.time()) + DAILY_TOKEN_TTL,
            "is_owner": False,
        }
    }
    with httpx.Client(timeout=10.0) as client:
        r = client.post(f"{DAILY_API_BASE}/meeting-tokens", json=body, headers=_daily_headers())
    if not r.is_success:
        raise HTTPException(status_code=502, detail=f"Daily token mint failed: {r.text}")
    return r.json()["token"]


def _user_basic(user_id: int) -> dict:
    sb = get_supabase()
    resp = (
        sb.table("users")
        .select("id, role, client_id, attorney_id, email")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="User not found.")
    return rows[0]


def _display_name_for_user(user_id: int) -> str:
    user = _user_basic(user_id)
    sb = get_supabase()
    if user.get("role") == "client" and user.get("client_id"):
        resp = sb.table("clients").select("full_name").eq("id", user["client_id"]).limit(1).execute()
        rows = resp.data or []
        if rows and rows[0].get("full_name"):
            return rows[0]["full_name"]
    if user.get("role") == "attorney" and user.get("attorney_id"):
        resp = sb.table("attorneys").select("full_name").eq("id", user["attorney_id"]).limit(1).execute()
        rows = resp.data or []
        if rows and rows[0].get("full_name"):
            return rows[0]["full_name"]
    return user.get("email") or "User"


def _attorney_shares_case(attorney_internal_id: int, callee_user_id: int, case_id: Optional[int]) -> bool:
    callee = _user_basic(callee_user_id)
    callee_client_id = callee.get("client_id")
    if callee_client_id is None:
        return False
    sb = get_supabase()
    q = (
        sb.table("cases")
        .select("id", count="exact")
        .eq("attorney_id", attorney_internal_id)
        .eq("client_id", callee_client_id)
    )
    if case_id is not None:
        q = q.eq("id", case_id)
    resp = q.limit(1).execute()
    return int(resp.count or 0) > 0


def list_callable_clients_for_attorney(attorney_internal_id: int) -> List[CallableClient]:
    sb = get_supabase()

    cases_resp = (
        sb.table("cases")
        .select("client_id")
        .eq("attorney_id", attorney_internal_id)
        .execute()
    )
    client_ids = sorted({
        int(r["client_id"]) for r in (cases_resp.data or []) if r.get("client_id") is not None
    })
    if not client_ids:
        return []

    users_resp = (
        sb.table("users")
        .select("id, client_id, last_logged_in")
        .in_("client_id", client_ids)
        .eq("role", "client")
        .not_.is_("last_logged_in", "null")
        .execute()
    )
    user_by_client: Dict[int, dict] = {}
    for u in users_resp.data or []:
        cid = u.get("client_id")
        if cid is None:
            continue
        user_by_client[int(cid)] = u
    if not user_by_client:
        return []

    clients_resp = (
        sb.table("clients")
        .select("id, full_name, email, phone, state")
        .in_("id", list(user_by_client.keys()))
        .order("full_name")
        .execute()
    )
    out: List[CallableClient] = []
    for c in clients_resp.data or []:
        cid = int(c["id"])
        u = user_by_client.get(cid)
        if not u:
            continue
        out.append(CallableClient(
            id=cid,
            user_id=int(u["id"]),
            full_name=c.get("full_name") or "Unknown",
            email=c.get("email"),
            phone=c.get("phone"),
            state=c.get("state"),
            last_logged_in=u.get("last_logged_in"),
        ))
    return out


def _to_unix_ms(iso: Optional[str]) -> Optional[int]:
    if not iso:
        return None
    try:
        s = iso.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    except Exception:
        return None


def get_call_history_for_user(user_id: int) -> List[CallHistoryItem]:
    sb = get_supabase()
    resp = (
        sb.table("calls")
        .select(
            "id, caller_user_id, callee_user_id, case_id, status, is_video, "
            "started_at, answered_at, ended_at, duration_seconds, end_reason"
        )
        .or_(f"caller_user_id.eq.{user_id},callee_user_id.eq.{user_id}")
        .order("started_at", desc=True)
        .limit(200)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return []

    other_user_ids: set = set()
    case_ids: set = set()
    for r in rows:
        other = r["callee_user_id"] if int(r["caller_user_id"]) == user_id else r["caller_user_id"]
        other_user_ids.add(int(other))
        if r.get("case_id") is not None:
            case_ids.add(int(r["case_id"]))

    users_resp = (
        sb.table("users")
        .select("id, role, client_id, attorney_id, email")
        .in_("id", list(other_user_ids))
        .execute()
    )
    users_by_id: Dict[int, dict] = {int(u["id"]): u for u in (users_resp.data or [])}

    client_ids_to_fetch = [
        int(u["client_id"]) for u in users_by_id.values()
        if u.get("role") == "client" and u.get("client_id") is not None
    ]
    clients_by_id: Dict[int, dict] = {}
    if client_ids_to_fetch:
        cresp = (
            sb.table("clients")
            .select("id, full_name, email")
            .in_("id", client_ids_to_fetch)
            .execute()
        )
        clients_by_id = {int(c["id"]): c for c in (cresp.data or [])}

    attorney_ids_to_fetch = [
        int(u["attorney_id"]) for u in users_by_id.values()
        if u.get("role") == "attorney" and u.get("attorney_id") is not None
    ]
    attorneys_by_id: Dict[int, dict] = {}
    if attorney_ids_to_fetch:
        aresp = (
            sb.table("attorneys")
            .select("id, full_name, email")
            .in_("id", attorney_ids_to_fetch)
            .execute()
        )
        attorneys_by_id = {int(a["id"]): a for a in (aresp.data or [])}

    cases_by_id: Dict[int, dict] = {}
    if case_ids:
        caresp = sb.table("cases").select("id, title").in_("id", list(case_ids)).execute()
        cases_by_id = {int(c["id"]): c for c in (caresp.data or [])}

    out: List[CallHistoryItem] = []
    for r in rows:
        is_outgoing = int(r["caller_user_id"]) == user_id
        other_id = int(r["callee_user_id"] if is_outgoing else r["caller_user_id"])
        other_user = users_by_id.get(other_id, {})
        name = "Unknown"
        email: Optional[str] = None
        if other_user.get("role") == "client":
            cli = clients_by_id.get(int(other_user.get("client_id") or 0))
            if cli:
                name = cli.get("full_name") or name
                email = cli.get("email")
        elif other_user.get("role") == "attorney":
            att = attorneys_by_id.get(int(other_user.get("attorney_id") or 0))
            if att:
                name = att.get("full_name") or name
                email = att.get("email")
        else:
            email = other_user.get("email")

        case_title: Optional[str] = None
        if r.get("case_id") is not None:
            case_row = cases_by_id.get(int(r["case_id"]))
            if case_row:
                case_title = case_row.get("title")

        out.append(CallHistoryItem(
            id=r["id"],
            direction="outgoing" if is_outgoing else "incoming",
            other_party_user_id=other_id,
            other_party_name=name,
            other_party_email=email,
            case_id=r.get("case_id"),
            case_title=case_title,
            status=r["status"],
            is_video=bool(r.get("is_video")),
            started_at=_to_unix_ms(r.get("started_at")) or 0,
            answered_at=_to_unix_ms(r.get("answered_at")),
            ended_at=_to_unix_ms(r.get("ended_at")),
            duration_seconds=r.get("duration_seconds"),
            end_reason=r.get("end_reason"),
        ))
    return out


def initiate_call_for_attorney(
    attorney_user_id: int,
    attorney_internal_id: int,
    callee_user_id: int,
    case_id: Optional[int],
    is_video: bool = False,
) -> InitiateCallResponse:
    if attorney_user_id == callee_user_id:
        raise HTTPException(status_code=400, detail="Cannot call yourself.")
    if not _attorney_shares_case(attorney_internal_id, callee_user_id, case_id):
        raise HTTPException(status_code=403, detail="You don't share a case with this client.")

    caller_name = _display_name_for_user(attorney_user_id)
    callee_name = _display_name_for_user(callee_user_id)

    room = _create_daily_room(is_video=is_video)
    caller_token = _mint_meeting_token(room["name"], caller_name)

    sb = get_supabase()
    call_id = str(uuid.uuid4())
    sb.table("calls").insert({
        "id": call_id,
        "daily_room_name": room["name"],
        "daily_room_url": room["url"],
        "caller_user_id": attorney_user_id,
        "callee_user_id": callee_user_id,
        "case_id": case_id,
        "status": "initiated",
        "is_video": is_video,
        "started_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    _broadcast(
        f"user:{callee_user_id}",
        "incoming_call",
        {
            "id": call_id,
            "caller_user_id": attorney_user_id,
            "callee_user_id": callee_user_id,
            "daily_room_url": room["url"],
            "is_video": is_video,
            "status": "initiated",
        },
    )

    try:
        sb.table("client_call_pushes").insert({
            "call_id": call_id,
            "callee_user_id": callee_user_id,
            "caller_user_id": attorney_user_id,
            "daily_room_url": room["url"],
            "is_video": is_video,
        }).execute()
    except Exception as e:
        print(f"[client_call_pushes] insert failed call_id={call_id}: {e!r}", flush=True)

    return InitiateCallResponse(
        call_id=call_id,
        daily_room_url=room["url"],
        daily_meeting_token=caller_token,
        callee_name=callee_name,
        is_video=is_video,
    )


def accept_call_for_user(call_id: str, user_id: int) -> AcceptCallResponse:
    """Callee retrieves their own meeting token for an already-initiated call."""
    sb = get_supabase()
    resp = (
        sb.table("calls")
        .select("id, callee_user_id, daily_room_name, daily_room_url, status, is_video")
        .eq("id", call_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Call not found.")
    call = rows[0]
    if int(call["callee_user_id"]) != user_id:
        raise HTTPException(status_code=403, detail="Not the callee for this call.")
    if not call.get("daily_room_name"):
        raise HTTPException(status_code=500, detail="Call has no Daily room.")

    user_name = _display_name_for_user(user_id)
    token = _mint_meeting_token(call["daily_room_name"], user_name)

    sb.table("calls").update({
        "status": "answered",
        "answered_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", call_id).execute()

    return AcceptCallResponse(
        call_id=call_id,
        daily_room_url=call["daily_room_url"],
        daily_meeting_token=token,
        is_video=bool(call.get("is_video")),
    )


_TERMINAL_CALL_STATUSES = {"completed", "rejected", "cancelled", "missed", "failed"}


def get_call_status_for_user(call_id: str, user_id: int) -> str:
    """Return the current `status` field of a call, with auth: the caller
    must be one of the two participants. Used by the polling loop in the
    attorney call screen to detect callee-side accept/decline/timeout
    transitions when Daily's participant events don't fire."""
    sb = get_supabase()
    resp = (
        sb.table("calls")
        .select("caller_user_id, callee_user_id, status")
        .eq("id", call_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Call not found.")
    call = rows[0]
    if int(call["caller_user_id"]) != user_id and int(call["callee_user_id"]) != user_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Not your call.")
    return str(call.get("status") or "")


def end_call_for_user(call_id: str, user_id: int, end_reason: str) -> str:
    sb = get_supabase()
    resp = (
        sb.table("calls")
        .select("id, caller_user_id, callee_user_id, status, answered_at, daily_room_name")
        .eq("id", call_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Call not found.")
    call = rows[0]
    if int(call["caller_user_id"]) != user_id and int(call["callee_user_id"]) != user_id:
        raise HTTPException(status_code=403, detail="Not your call.")

    # Terminal-state guard: if the call already reached a terminal status (e.g.
    # the other party already declined or hung up), preserve it. This ensures
    # call history shows the real reason — a late "cancelled_before_answer"
    # from the caller's screen after a "declined" from the callee must not
    # overwrite the recorded "rejected" status.
    if call.get("status") in _TERMINAL_CALL_STATUSES:
        return str(call["status"])

    status_map = {
        "caller_hangup": "completed",
        "callee_hangup": "completed",
        "declined": "rejected",
        "cancelled_before_answer": "cancelled",
        "timeout": "missed",
        "network_error": "failed",
        "failed": "failed",
    }
    new_status = status_map.get(end_reason, "completed")
    if new_status == "completed" and not call.get("answered_at"):
        new_status = "cancelled"

    now = datetime.now(timezone.utc).isoformat()
    duration: Optional[int] = None
    if call.get("answered_at"):
        try:
            ans = datetime.fromisoformat(call["answered_at"].replace("Z", "+00:00"))
            end = datetime.fromisoformat(now.replace("Z", "+00:00"))
            duration = max(0, int((end - ans).total_seconds()))
        except Exception:
            duration = None

    sb.table("calls").update({
        "status": new_status,
        "ended_at": now,
        "duration_seconds": duration,
        "end_reason": end_reason,
    }).eq("id", call_id).execute()

    # Notify both ends so any open modal/in-call screen can react.
    other_user_id = (
        int(call["callee_user_id"]) if int(call["caller_user_id"]) == user_id
        else int(call["caller_user_id"])
    )
    _broadcast(
        f"user:{other_user_id}",
        "call_status",
        {"id": call_id, "status": new_status},
    )

    # Best-effort: clean up the Daily room. Rooms also auto-expire via `exp`,
    # so failures here are non-fatal.
    if call.get("daily_room_name"):
        try:
            with httpx.Client(timeout=5.0) as client:
                client.delete(
                    f"{DAILY_API_BASE}/rooms/{call['daily_room_name']}",
                    headers=_daily_headers(),
                )
        except Exception:
            pass

    return new_status


def delete_call_for_user(call_id: str, user_id: int) -> None:
    sb = get_supabase()
    resp = (
        sb.table("calls")
        .select("id, caller_user_id, callee_user_id")
        .eq("id", call_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Call not found.")
    call = rows[0]
    if int(call["caller_user_id"]) != user_id and int(call["callee_user_id"]) != user_id:
        raise HTTPException(status_code=403, detail="Not your call.")
    sb.table("calls").delete().eq("id", call_id).execute()
