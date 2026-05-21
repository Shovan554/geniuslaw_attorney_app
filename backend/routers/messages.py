from typing import Optional

from fastapi import APIRouter, Depends, Query

from middleware.auth_middleware import require_access_token, require_attorney_id
from models.message import (
    ConversationListResponse,
    ConversationSummary,
    CreateConversationRequest,
    MessageItem,
    MessageListResponse,
    MessageableClientListResponse,
    SendMessageRequest,
)
from services.messages_service import (
    create_or_get_conversation,
    delete_conversation_for_user,
    list_conversations_for_user,
    list_messageable_clients_for_attorney,
    list_messages_for_user,
    mark_conversation_read,
    send_message_for_user,
)

router = APIRouter(prefix="/messages", tags=["messages"])


def _user_id_from_token(token: dict = Depends(require_access_token)) -> int:
    return int(token["sub"])


@router.get("/conversations", response_model=ConversationListResponse)
def list_conversations(user_id: int = Depends(_user_id_from_token)) -> ConversationListResponse:
    convs = list_conversations_for_user(user_id)
    return ConversationListResponse(conversations=convs)


@router.post("/conversations", response_model=ConversationSummary)
def create_conversation(
    body: CreateConversationRequest,
    user_id: int = Depends(_user_id_from_token),
    attorney_id: int = Depends(require_attorney_id),
) -> ConversationSummary:
    return create_or_get_conversation(user_id, attorney_id, body.client_id)


@router.get("/conversations/{conversation_id}/messages", response_model=MessageListResponse)
def get_messages(
    conversation_id: str,
    limit: int = Query(50, ge=1, le=100),
    before: Optional[int] = Query(None),
    user_id: int = Depends(_user_id_from_token),
) -> MessageListResponse:
    msgs = list_messages_for_user(user_id, conversation_id, limit=limit, before=before)
    return MessageListResponse(messages=msgs)


@router.post("/conversations/{conversation_id}/messages", response_model=MessageItem)
def post_message(
    conversation_id: str,
    body: SendMessageRequest,
    user_id: int = Depends(_user_id_from_token),
) -> MessageItem:
    return send_message_for_user(user_id, conversation_id, body.body_text)


@router.post("/conversations/{conversation_id}/read")
def mark_read(
    conversation_id: str,
    user_id: int = Depends(_user_id_from_token),
) -> dict:
    mark_conversation_read(user_id, conversation_id)
    return {"ok": True}


@router.get("/messageable-clients", response_model=MessageableClientListResponse)
def messageable_clients(
    attorney_id: int = Depends(require_attorney_id),
) -> MessageableClientListResponse:
    clients = list_messageable_clients_for_attorney(attorney_id)
    return MessageableClientListResponse(clients=clients)


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: str,
    user_id: int = Depends(_user_id_from_token),
    _: int = Depends(require_attorney_id),
) -> dict:
    delete_conversation_for_user(user_id, conversation_id)
    return {"ok": True}
