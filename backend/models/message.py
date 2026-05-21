from typing import List, Optional

from pydantic import BaseModel


class ConversationSummary(BaseModel):
    id: str
    client_id: Optional[int] = None
    client_name: Optional[str] = None
    client_email: Optional[str] = None
    last_message_preview: Optional[str] = None
    last_message_at: Optional[int] = None
    unread_count: int = 0
    created_at: int
    updated_at: int


class ConversationListResponse(BaseModel):
    conversations: List[ConversationSummary]


class MessageItem(BaseModel):
    id: str
    conversation_id: str
    sender_user_id: int
    sender_role: str
    sender_name: Optional[str] = None
    body_text: Optional[str] = None
    message_type: str = "text"
    created_at: int


class MessageListResponse(BaseModel):
    messages: List[MessageItem]


class CreateConversationRequest(BaseModel):
    client_id: int


class SendMessageRequest(BaseModel):
    body_text: str


class MessageableClient(BaseModel):
    id: int
    full_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    state: Optional[str] = None
    last_logged_in: Optional[str] = None


class MessageableClientListResponse(BaseModel):
    clients: List[MessageableClient]
