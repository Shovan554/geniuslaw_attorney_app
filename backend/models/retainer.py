from typing import Any, List, Optional

from pydantic import BaseModel


class RetainerSummary(BaseModel):
    """One row of `retainer_history`, resolved for attorney display.

    `payment_terms` is left as `Any` on purpose: the staff portal owns that jsonb
    column and has written more than one shape into it. A strict model here would
    500 the whole endpoint the first time a new shape appears, so the tolerance
    lives in the mobile layer (`lib/retainerStatus.ts`) where it is unit-tested.
    """

    id: str
    created_at: Optional[str] = None
    name: str
    matter_type: Optional[str] = None
    envelope_status: str
    flat_fee: Optional[float] = None
    payment_terms: Any = None
    rep_type: Optional[str] = None
    state: Optional[str] = None
    firm_name: Optional[str] = None


class RetainerListResponse(BaseModel):
    retainers: List[RetainerSummary]
