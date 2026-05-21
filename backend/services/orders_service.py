from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status

from models.order import OrderSummary
from services.supabase_client import get_supabase


_ORDER_SELECT = (
    "id,case_id,order_date,service_type,status,current_step,due_date,state,"
    "contract_amount,paid_amount"
)

_ACRONYMS = {"ssdi", "ssfd", "hoa"}
_SERVICE_TYPE_OVERRIDES: Dict[str, str] = {"common": "Dual Track"}


def _token_case(token: str) -> str:
    if token.lower() in _ACRONYMS:
        return token.upper()
    return token.capitalize()


def _format_service_type(raw: Optional[str]) -> str:
    if not raw:
        return "Unknown"
    if raw in _SERVICE_TYPE_OVERRIDES:
        return _SERVICE_TYPE_OVERRIDES[raw]
    tokens = raw.split("_")
    return " ".join(_token_case(t) for t in tokens if t)


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


def _to_summary(row: Dict[str, Any]) -> OrderSummary:
    service_type = row.get("service_type")
    return OrderSummary(
        id=int(row["id"]),
        order_date=_parse_date(row.get("order_date")),
        service_type=service_type,
        service_type_label=_format_service_type(service_type),
        status=row.get("status"),
        current_step=row.get("current_step"),
        current_step_label=None,
        due_date=_parse_date(row.get("due_date")),
        state=row.get("state"),
        contract_amount=float(row.get("contract_amount") or 0),
        paid_amount=float(row.get("paid_amount") or 0),
    )


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
    return [_to_summary(r) for r in rows]
