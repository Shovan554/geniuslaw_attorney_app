from typing import List, Optional

from pydantic import BaseModel


class ClientSummary(BaseModel):
    id: int
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    state: Optional[str] = None
    case_count: int = 0


class ClientListResponse(BaseModel):
    clients: List[ClientSummary]
