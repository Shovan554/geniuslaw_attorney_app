from datetime import date
from typing import List, Optional

from pydantic import BaseModel


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


class OrderListResponse(BaseModel):
    orders: List[OrderSummary]
