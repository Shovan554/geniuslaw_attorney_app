from datetime import date
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel


StepState = Literal["complete", "current", "pending"]


class StepItem(BaseModel):
    key: str
    label: str
    state: StepState


class StepGroup(BaseModel):
    roman: str
    key: str
    label: str
    state: StepState
    completed_count: int
    total_count: int
    steps: List[StepItem]


class OrderSummary(BaseModel):
    id: int
    order_date: Optional[date] = None
    service_type: Optional[str] = None
    service_type_label: str
    status: Optional[str] = None
    current_step: Optional[str] = None
    current_step_label: Optional[str] = None
    due_date: Optional[date] = None
    state: Optional[str] = None
    contract_amount: float = 0.0
    paid_amount: float = 0.0


class OrderDetail(OrderSummary):
    case_id: int
    service_fee: float = 0.0
    sell_date: Optional[date] = None
    case_type: Optional[str] = None
    groups: List[StepGroup] = []
    # Raw `orders.history` rows, passed through untouched. Entries are written by the
    # staff portal and have drifted across several shapes over the years (legacy
    # `description` rows, `changes` maps, manual `note` rows, pin/urgent flags). Typing
    # them here would 500 the endpoint the moment the portal adds a field, so
    # normalization lives in `mobile/lib/orderHistory.ts` where it is unit-tested.
    history: List[Dict[str, Any]] = []
    # CaseCheck payloads, passed through untouched for the same reason as `history`.
    # `casecheck_identity_details` is a list of {key, value} pairs; `casecheck_updates`
    # is a list of report objects, only some of which have a `report` written yet.
    # Normalized in `mobile/lib/casecheck.ts`.
    casecheck_identity_details: List[Dict[str, Any]] = []
    casecheck_updates: List[Dict[str, Any]] = []


class OrderListResponse(BaseModel):
    orders: List[OrderSummary]
