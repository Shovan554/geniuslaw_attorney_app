from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status

from models.order import OrderDetail, OrderSummary, StepGroup, StepItem, StepState
from services.step_parser import parse_step_blob
from services.supabase_client import get_supabase


_ORDER_SELECT = (
    "id,case_id,order_date,service_type,status,current_step,due_date,state,"
    "contract_amount,paid_amount"
)

_ORDER_DETAIL_SELECT = (
    _ORDER_SELECT
    + ",service_fee,sell_date,case_type,history"
    + ",casecheck_identity_details,casecheck_updates"
)

_ROMAN = ["I", "II", "III", "IV", "V", "VI"]
_ACRONYMS = {"ssdi", "ssfd", "hoa"}
_SERVICE_TYPE_OVERRIDES: Dict[str, str] = {"common": "Dual Track"}


def _token_case(token: str) -> str:
    if token.lower() in _ACRONYMS:
        return token.upper()
    return token.capitalize()


def _format_service_type(raw: Optional[str]) -> str:
    """Mechanical fallback: 'casecheck' -> 'Casecheck', 'tax_lean' -> 'Tax Lean'.

    Only used when service_type_values has no curated name for the key — see
    _service_type_label.
    """
    if not raw:
        return "Unknown"
    if raw in _SERVICE_TYPE_OVERRIDES:
        return _SERVICE_TYPE_OVERRIDES[raw]
    tokens = raw.split("_")
    return " ".join(_token_case(t) for t in tokens if t)


def _service_type_label(raw: Optional[str], name: Optional[str]) -> str:
    """Display name for an order's service type.

    service_type_values.service_type_name is the curated, human-written label
    ('CaseCheck', not 'Casecheck'), so it wins whenever it exists. The mechanical
    formatter is the fallback for service types with no row or a blank name.
    """
    cleaned = (name or "").strip()
    return cleaned or _format_service_type(raw)


def _group_label(group_key: str) -> str:
    stripped = group_key[:-6] if group_key.endswith("_steps") else group_key
    if not stripped:
        stripped = group_key
    return " ".join(_token_case(t) for t in stripped.split("_") if t)


def _parse_date(raw: Any) -> Optional[date]:
    if raw is None:
        return None
    if isinstance(raw, date) and not isinstance(raw, datetime):
        return raw
    if isinstance(raw, datetime):
        return raw.date()
    try:
        return date.fromisoformat(str(raw)[:10])
    except (TypeError, ValueError):
        return None


def _verify_case_belongs_to_attorney(case_id: int, attorney_id: int) -> None:
    sb = get_supabase()
    resp = (
        sb.table("cases")
        .select("id,attorney_id")
        .eq("id", case_id)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows or int(rows[0].get("attorney_id") or 0) != attorney_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Case not found.",
        )


def _to_summary(
    row: Dict[str, Any],
    current_step_label: Optional[str] = None,
    service_type_name: Optional[str] = None,
) -> OrderSummary:
    service_type = row.get("service_type")
    return OrderSummary(
        id=int(row["id"]),
        order_date=_parse_date(row.get("order_date")),
        service_type=service_type,
        service_type_label=_service_type_label(service_type, service_type_name),
        status=row.get("status"),
        current_step=row.get("current_step"),
        current_step_label=current_step_label,
        due_date=_parse_date(row.get("due_date")),
        state=row.get("state"),
        contract_amount=float(row.get("contract_amount") or 0),
        paid_amount=float(row.get("paid_amount") or 0),
    )


def _build_service_type_maps(
    service_types: List[str],
) -> Tuple[Dict[str, Dict[str, str]], Dict[str, str]]:
    """Look up everything we need from service_type_values in one query.

    Returns ({service_type: {step_key: step_label}}, {service_type: display_name}).
    service_type has only an index, not a unique constraint, so duplicate rows are
    possible — the first non-blank name wins rather than the last row read.
    """
    if not service_types:
        return {}, {}
    sb = get_supabase()
    resp = (
        sb.table("service_type_values")
        .select("service_type,service_type_name,val1,val2,val3,val4,val5,val6")
        .in_("service_type", service_types)
        .execute()
    )
    rows = resp.data or []
    label_map: Dict[str, Dict[str, str]] = {}
    name_map: Dict[str, str] = {}
    for row in rows:
        svc = row.get("service_type")
        if not svc:
            continue
        name = (row.get("service_type_name") or "").strip()
        if name and not name_map.get(svc):
            name_map[svc] = name
        labels: Dict[str, str] = {}
        for key in ("val1", "val2", "val3", "val4", "val5", "val6"):
            parsed = parse_step_blob(row.get(key))
            if parsed is None:
                continue
            for step_key, step_label in parsed[1]:
                labels[step_key] = step_label
        label_map[svc] = labels
    return label_map, name_map


def list_orders_for_case_attorney(case_id: int, attorney_id: int) -> List[OrderSummary]:
    _verify_case_belongs_to_attorney(case_id, attorney_id)
    sb = get_supabase()
    resp = (
        sb.table("orders")
        .select(_ORDER_SELECT)
        .eq("case_id", case_id)
        .order("order_date", desc=True)
        .execute()
    )
    rows = resp.data or []

    service_types = sorted({r.get("service_type") for r in rows if r.get("service_type")})
    label_map, name_map = _build_service_type_maps(service_types)

    summaries: List[OrderSummary] = []
    for r in rows:
        svc = r.get("service_type")
        step_key = r.get("current_step")
        label: Optional[str] = None
        if svc and step_key:
            label = label_map.get(svc, {}).get(step_key)
        summaries.append(
            _to_summary(
                r,
                current_step_label=label,
                service_type_name=name_map.get(svc) if svc else None,
            )
        )
    return summaries


def _fetch_service_type_row(service_type: Optional[str]) -> Dict[str, Any]:
    """The service_type_values row for one service type, or {} when there is none.

    Carries both the display name and the step blobs so the detail path reads
    this table once.
    """
    if not service_type:
        return {}
    sb = get_supabase()
    resp = (
        sb.table("service_type_values")
        .select("service_type_name,val1,val2,val3,val4,val5,val6")
        .eq("service_type", service_type)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else {}


def _step_groups_from_row(
    row: Dict[str, Any],
) -> List[Tuple[str, List[Tuple[str, str]]]]:
    groups: List[Tuple[str, List[Tuple[str, str]]]] = []
    for key in ("val1", "val2", "val3", "val4", "val5", "val6"):
        parsed = parse_step_blob(row.get(key))
        if parsed is not None:
            groups.append(parsed)
    return groups


def _assemble_groups(
    raw_groups: List[Tuple[str, List[Tuple[str, str]]]],
    current_step: Optional[str],
) -> Tuple[List[StepGroup], Optional[str]]:
    """Produce a StepGroup list with each state set relative to current_step.

    Returns (groups, current_step_label).
    """
    current_group_idx: Optional[int] = None
    current_step_label: Optional[str] = None
    if current_step:
        for idx, (_, steps) in enumerate(raw_groups):
            for step_key, step_label in steps:
                if step_key == current_step:
                    current_group_idx = idx
                    current_step_label = step_label
                    break
            if current_group_idx is not None:
                break

    assembled: List[StepGroup] = []
    for idx, (group_key, steps) in enumerate(raw_groups):
        roman = _ROMAN[idx] if idx < len(_ROMAN) else str(idx + 1)
        group_state: StepState
        step_items: List[StepItem] = []
        if current_group_idx is None:
            group_state = "pending"
            for k, lbl in steps:
                step_items.append(StepItem(key=k, label=lbl, state="pending"))
        elif idx < current_group_idx:
            group_state = "complete"
            for k, lbl in steps:
                step_items.append(StepItem(key=k, label=lbl, state="complete"))
        elif idx > current_group_idx:
            group_state = "pending"
            for k, lbl in steps:
                step_items.append(StepItem(key=k, label=lbl, state="pending"))
        else:
            group_state = "current"
            seen_current = False
            for k, lbl in steps:
                if k == current_step:
                    step_items.append(StepItem(key=k, label=lbl, state="current"))
                    seen_current = True
                elif not seen_current:
                    step_items.append(StepItem(key=k, label=lbl, state="complete"))
                else:
                    step_items.append(StepItem(key=k, label=lbl, state="pending"))

        completed_count = sum(1 for s in step_items if s.state == "complete")
        assembled.append(
            StepGroup(
                roman=roman,
                key=group_key,
                label=_group_label(group_key),
                state=group_state,
                completed_count=completed_count,
                total_count=len(step_items),
                steps=step_items,
            )
        )
    return assembled, current_step_label


def _coerce_dict_rows(raw: Any) -> List[Dict[str, Any]]:
    """Keep only dict rows from a portal-written jsonb array column.

    Used for `history`, `casecheck_identity_details` and `casecheck_updates`. These
    columns default to `[]` but have held stray scalars in the past; anything that is
    not an object is dropped rather than allowed to 500 the response model.
    """
    if not isinstance(raw, list):
        return []
    return [entry for entry in raw if isinstance(entry, dict)]


def _fetch_order_row(order_id: int, case_id: Optional[int] = None) -> Dict[str, Any]:
    sb = get_supabase()
    query = sb.table("orders").select(_ORDER_DETAIL_SELECT).eq("id", order_id)
    if case_id is not None:
        query = query.eq("case_id", case_id)
    resp = query.limit(1).execute()
    rows = resp.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found.",
        )
    return rows[0]


def get_order_for_attorney(order_id: int, attorney_id: int) -> OrderDetail:
    """Order lookup with no case_id in hand.

    Alerts carry only the order id, so the case has to be derived from the
    order row before ownership can be checked.
    """
    row = _fetch_order_row(order_id)
    # An order owned by someone else must look identical to one that does not
    # exist — a 403/404 split would leak which order ids are real.
    try:
        _verify_case_belongs_to_attorney(int(row.get("case_id") or 0), attorney_id)
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found.",
        )
    return _build_order_detail(row)


def get_order_for_case_attorney(
    case_id: int, order_id: int, attorney_id: int
) -> OrderDetail:
    _verify_case_belongs_to_attorney(case_id, attorney_id)
    row = _fetch_order_row(order_id, case_id=case_id)
    return _build_order_detail(row)


def _build_order_detail(row: Dict[str, Any]) -> OrderDetail:
    service_type_row = _fetch_service_type_row(row.get("service_type"))
    raw_groups = _step_groups_from_row(service_type_row)
    groups, current_step_label = _assemble_groups(raw_groups, row.get("current_step"))

    summary = _to_summary(
        row,
        current_step_label=current_step_label,
        service_type_name=service_type_row.get("service_type_name"),
    )
    return OrderDetail(
        **summary.model_dump(),
        case_id=int(row["case_id"]),
        service_fee=float(row.get("service_fee") or 0),
        sell_date=_parse_date(row.get("sell_date")),
        case_type=row.get("case_type"),
        groups=groups,
        history=_coerce_dict_rows(row.get("history")),
        casecheck_identity_details=_coerce_dict_rows(
            row.get("casecheck_identity_details")
        ),
        casecheck_updates=_coerce_dict_rows(row.get("casecheck_updates")),
    )
