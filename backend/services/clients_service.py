from typing import Dict, List, Optional

from models.client import ClientSummary
from services.supabase_client import get_supabase


def _case_count_for_attorney_client(attorney_id: int, client_id: int) -> int:
    sb = get_supabase()
    resp = (
        sb.table("cases")
        .select("id", count="exact")
        .eq("attorney_id", attorney_id)
        .eq("client_id", client_id)
        .execute()
    )
    return int(resp.count or 0)


def get_client_for_attorney(client_id: int, attorney_id: int) -> Optional[ClientSummary]:
    """Fetch a client only if the attorney has at least one case with them."""
    case_count = _case_count_for_attorney_client(attorney_id, client_id)
    if case_count == 0:
        return None

    sb = get_supabase()
    resp = (
        sb.table("clients")
        .select("id,full_name,email,phone,state")
        .eq("id", client_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return None
    c = rows[0]
    return ClientSummary(
        id=int(c["id"]),
        full_name=c.get("full_name") or "Unknown",
        email=c.get("email"),
        phone=c.get("phone"),
        state=c.get("state"),
        case_count=case_count,
    )


def list_clients_for_attorney(attorney_id: int) -> List[ClientSummary]:
    """Distinct clients drawn from cases assigned to this attorney."""
    sb = get_supabase()

    cases_resp = (
        sb.table("cases")
        .select("client_id")
        .eq("attorney_id", attorney_id)
        .execute()
    )
    rows = cases_resp.data or []

    case_count: Dict[int, int] = {}
    for r in rows:
        cid = r.get("client_id")
        if cid is None:
            continue
        case_count[int(cid)] = case_count.get(int(cid), 0) + 1

    if not case_count:
        return []

    clients_resp = (
        sb.table("clients")
        .select("id,full_name,email,phone,state")
        .in_("id", list(case_count.keys()))
        .order("full_name")
        .execute()
    )

    out: List[ClientSummary] = []
    for c in clients_resp.data or []:
        cid = int(c["id"])
        out.append(
            ClientSummary(
                id=cid,
                full_name=c.get("full_name") or "Unknown",
                email=c.get("email"),
                phone=c.get("phone"),
                state=c.get("state"),
                case_count=case_count.get(cid, 0),
            )
        )
    return out
