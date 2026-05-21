from datetime import date, datetime
from typing import Any, Dict, List, Optional

from models.case import CaseStatus, CaseSummary
from services.supabase_client import get_supabase


_CASE_SELECT = (
    "id,title,case_type,status,case_number,opened_at,closed_at,updated_at,"
    "client_id,attorney_id,notes"
)

_VALID_STATUSES: set[CaseStatus] = {"open", "closed", "in_progress"}


def _normalize_status(raw: Optional[str]) -> CaseStatus:
    if not raw:
        return "open"
    lowered = raw.strip().lower().replace("-", "_").replace(" ", "_")
    if lowered in _VALID_STATUSES:
        return lowered  # type: ignore[return-value]
    return "open"


def _parse_dt(raw: Any) -> Optional[datetime]:
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _parse_closed_at(raw: Any) -> Optional[date]:
    if raw is None:
        return None
    if isinstance(raw, date) and not isinstance(raw, datetime):
        return raw
    dt = _parse_dt(raw)
    return dt.date() if dt else None


def _fetch_client_names(client_ids: List[int]) -> Dict[int, str]:
    if not client_ids:
        return {}
    sb = get_supabase()
    try:
        resp = sb.table("clients").select("id,full_name").in_("id", client_ids).execute()
    except Exception as exc:
        print(f"[cases_service._fetch_client_names] error={exc!r}", flush=True)
        return {}
    rows = resp.data or []
    out: Dict[int, str] = {}
    for row in rows:
        cid = row.get("id")
        name = row.get("full_name")
        if cid is not None and name:
            out[int(cid)] = name
    return out


def _row_to_case(
    row: dict,
    client_name: Optional[str],
    *,
    include_notes: bool = False,
) -> CaseSummary:
    status = _normalize_status(row.get("status"))
    return CaseSummary(
        id=row["id"],
        title=row["title"],
        case_type=row.get("case_type"),
        status=status,
        case_number=row.get("case_number"),
        opened_at=_parse_dt(row.get("opened_at")),
        closed_at=_parse_closed_at(row.get("closed_at")) if status == "closed" else None,
        updated_at=_parse_dt(row.get("updated_at")),
        client_id=row.get("client_id"),
        client_name=client_name,
        notes=row.get("notes") if include_notes else None,
    )


def list_cases_for_attorney(
    attorney_id: int,
    *,
    exclude_closed: bool = False,
    limit: Optional[int] = None,
    client_id: Optional[int] = None,
) -> List[CaseSummary]:
    sb = get_supabase()
    query = (
        sb.table("cases")
        .select(_CASE_SELECT)
        .eq("attorney_id", attorney_id)
        .order("updated_at", desc=True)
    )
    if client_id is not None:
        query = query.eq("client_id", client_id)
    if exclude_closed:
        query = query.neq("status", "closed")
    if limit is not None:
        query = query.limit(limit)
    resp = query.execute()
    rows = resp.data or []

    client_ids = sorted({int(r["client_id"]) for r in rows if r.get("client_id") is not None})
    name_by_id = _fetch_client_names(client_ids)

    return [
        _row_to_case(
            row,
            name_by_id.get(int(row["client_id"])) if row.get("client_id") else None,
        )
        for row in rows
    ]


def get_case_for_attorney(case_id: int, attorney_id: int) -> Optional[CaseSummary]:
    sb = get_supabase()
    resp = (
        sb.table("cases")
        .select(_CASE_SELECT)
        .eq("id", case_id)
        .eq("attorney_id", attorney_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return None
    row = rows[0]
    client_id = row.get("client_id")
    name_by_id = _fetch_client_names([int(client_id)] if client_id else [])
    return _row_to_case(
        row,
        name_by_id.get(int(client_id)) if client_id else None,
        include_notes=True,
    )
