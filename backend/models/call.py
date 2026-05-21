from typing import List, Literal, Optional

from pydantic import BaseModel


CallStatus = Literal[
    "initiated",
    "ringing",
    "answered",
    "rejected",
    "missed",
    "completed",
    "failed",
    "cancelled",
]

CallDirection = Literal["incoming", "outgoing"]


class CallHistoryItem(BaseModel):
    id: str
    direction: CallDirection
    other_party_user_id: int
    other_party_name: str
    other_party_email: Optional[str] = None
    case_id: Optional[int] = None
    case_title: Optional[str] = None
    status: CallStatus
    is_video: bool = False
    started_at: int
    answered_at: Optional[int] = None
    ended_at: Optional[int] = None
    duration_seconds: Optional[int] = None
    end_reason: Optional[str] = None


class CallHistoryResponse(BaseModel):
    calls: List[CallHistoryItem]


class CallableClient(BaseModel):
    id: int
    user_id: int
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    state: Optional[str] = None
    last_logged_in: Optional[str] = None


class CallableClientListResponse(BaseModel):
    clients: List[CallableClient]


class InitiateCallRequest(BaseModel):
    callee_user_id: int
    case_id: Optional[int] = None
    is_video: bool = False


class InitiateCallResponse(BaseModel):
    call_id: str
    daily_room_url: str
    daily_meeting_token: str
    callee_name: str
    is_video: bool


class AcceptCallResponse(BaseModel):
    call_id: str
    daily_room_url: str
    daily_meeting_token: str
    is_video: bool


class EndCallRequest(BaseModel):
    end_reason: str
