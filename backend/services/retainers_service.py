from typing import Any, Dict, List, Optional, Tuple

from models.retainer import RetainerSummary
from services.supabase_client import get_supabase

# `retainer_history` has no foreign keys to leads / clients / attorneys (only to
# users, for fronter and closer), so PostgREST cannot embed those rows. The names,
# states and firm are resolved with separate batched lookups instead — the same
# approach `clients_service` takes for its case counts.
_RETAINER_COLUMNS = (
    "id,created_at,envelope_status,flat_fee,payment_terms,matter_type,"
    "rep_type,assigned_state,lead_name,lead_id,client_id"
)

# Attorneys accumulate retainers slowly and the list screen filters on device, so
# one capped fetch is enough. Raise this before reaching for pagination.
MAX_RETAINERS = 500


def _firm_name_for_attorney(attorney_id: int) -> Optional[str]:
    sb = get_supabase()
    att_resp = (
        sb.table("attorneys")
        .select("firm_id")
        .eq("id", attorney_id)
        .limit(1)
        .execute()
    )
    att_rows = att_resp.data or []
    if not att_rows:
        return None

    firm_id = att_rows[0].get("firm_id")
    if firm_id is None:
        return None

    firm_resp = (
        sb.table("law_firms")
        .select("name")
        .eq("id", firm_id)
        .limit(1)
        .execute()
    )
    firm_rows = firm_resp.data or []
    if not firm_rows:
        return None
    return firm_rows[0].get("name")


def _lookup_people(
    table: str, ids: List[int]
) -> Dict[int, Dict[str, Optional[str]]]:
    """Batch-resolve `{id: {full_name, state}}` from `leads` or `clients`."""
    if not ids:
        return {}

    sb = get_supabase()
    resp = sb.table(table).select("id,full_name,state").in_("id", ids).execute()

    out: Dict[int, Dict[str, Optional[str]]] = {}
    for row in resp.data or []:
        out[int(row["id"])] = {
            "full_name": row.get("full_name"),
            "state": row.get("state"),
        }
    return out


def _resolve_people(
    rows: List[Dict[str, Any]]
) -> Tuple[Dict[int, Dict[str, Optional[str]]], Dict[int, Dict[str, Optional[str]]]]:
    lead_ids = sorted({int(r["lead_id"]) for r in rows if r.get("lead_id") is not None})
    client_ids = sorted(
        {int(r["client_id"]) for r in rows if r.get("client_id") is not None}
    )
    return _lookup_people("leads", lead_ids), _lookup_people("clients", client_ids)


def _first_text(*candidates: Any) -> Optional[str]:
    """First candidate that is a non-blank string."""
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return None


def _to_float(raw: Any) -> Optional[float]:
    """PostgREST may hand back `numeric` as a string; tolerate both."""
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _to_summary(
    row: Dict[str, Any],
    leads: Dict[int, Dict[str, Optional[str]]],
    clients: Dict[int, Dict[str, Optional[str]]],
    firm_name: Optional[str],
) -> RetainerSummary:
    lead = leads.get(int(row["lead_id"])) if row.get("lead_id") is not None else None
    client = (
        clients.get(int(row["client_id"])) if row.get("client_id") is not None else None
    )

    name = _first_text(
        lead.get("full_name") if lead else None,
        client.get("full_name") if client else None,
        row.get("lead_name"),
    )
    state = _first_text(
        lead.get("state") if lead else None,
        client.get("state") if client else None,
        row.get("assigned_state"),
    )

    return RetainerSummary(
        id=str(row["id"]),
        created_at=row.get("created_at"),
        name=name or "Unknown",
        matter_type=_first_text(row.get("matter_type")),
        envelope_status=_first_text(row.get("envelope_status")) or "sent",
        flat_fee=_to_float(row.get("flat_fee")),
        payment_terms=row.get("payment_terms"),
        rep_type=_first_text(row.get("rep_type")),
        state=state,
        firm_name=firm_name,
    )


def list_retainers_for_attorney(attorney_id: int) -> List[RetainerSummary]:
    """Every retainer sent on behalf of this attorney, newest first."""
    sb = get_supabase()
    resp = (
        sb.table("retainer_history")
        .select(_RETAINER_COLUMNS)
        .eq("attorney_id", attorney_id)
        .order("created_at", desc=True)
        .limit(MAX_RETAINERS)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return []

    leads, clients = _resolve_people(rows)
    firm_name = _firm_name_for_attorney(attorney_id)
    return [_to_summary(row, leads, clients, firm_name) for row in rows]


def get_retainer_for_attorney(
    retainer_id: str, attorney_id: int
) -> Optional[RetainerSummary]:
    """One retainer, or None when it does not exist or belongs to someone else.

    The `attorney_id` filter is what enforces ownership — a caller cannot read
    another attorney's retainer by guessing its uuid.
    """
    sb = get_supabase()
    try:
        resp = (
            sb.table("retainer_history")
            .select(_RETAINER_COLUMNS)
            .eq("id", retainer_id)
            .eq("attorney_id", attorney_id)
            .limit(1)
            .execute()
        )
    except Exception:
        # A malformed uuid makes PostgREST reject the filter outright. That is a
        # "no such retainer", not a server fault.
        return None

    rows = resp.data or []
    if not rows:
        return None

    leads, clients = _resolve_people(rows)
    firm_name = _firm_name_for_attorney(attorney_id)
    return _to_summary(rows[0], leads, clients, firm_name)
