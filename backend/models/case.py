from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel


CaseStatus = Literal["open", "closed", "in_progress"]


class CaseSummary(BaseModel):
    id: int
    title: str
    case_type: Optional[str] = None
    status: CaseStatus = "open"
    case_number: Optional[str] = None
    opened_at: Optional[datetime] = None
    closed_at: Optional[date] = None
    updated_at: Optional[datetime] = None
    client_id: Optional[int] = None
    client_name: Optional[str] = None
    notes: Optional[str] = None


class CaseListResponse(BaseModel):
    cases: List[CaseSummary]
