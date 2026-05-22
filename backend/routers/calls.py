from fastapi import APIRouter, Depends

from middleware.auth_middleware import require_access_token, require_attorney_id
from models.call import (
    AcceptCallResponse,
    CallHistoryResponse,
    CallableClientListResponse,
    EndCallRequest,
    InitiateCallRequest,
    InitiateCallResponse,
)
from services.calls_service import (
    accept_call_for_user,
    delete_call_for_user,
    end_call_for_user,
    get_call_history_for_user,
    get_call_status_for_user,
    initiate_call_for_attorney,
    list_callable_clients_for_attorney,
)


router = APIRouter(prefix="/calls", tags=["calls"])


def _user_id_from_token(token: dict = Depends(require_access_token)) -> int:
    return int(token["sub"])


@router.get("/history", response_model=CallHistoryResponse)
def list_call_history(user_id: int = Depends(_user_id_from_token)) -> CallHistoryResponse:
    return CallHistoryResponse(calls=get_call_history_for_user(user_id))


@router.get("/callable-clients", response_model=CallableClientListResponse)
def callable_clients(
    attorney_id: int = Depends(require_attorney_id),
) -> CallableClientListResponse:
    return CallableClientListResponse(clients=list_callable_clients_for_attorney(attorney_id))


@router.post("/initiate", response_model=InitiateCallResponse)
def initiate_call(
    body: InitiateCallRequest,
    user_id: int = Depends(_user_id_from_token),
    attorney_id: int = Depends(require_attorney_id),
) -> InitiateCallResponse:
    return initiate_call_for_attorney(
        user_id, attorney_id, body.callee_user_id, body.case_id, body.is_video
    )


@router.post("/{call_id}/accept", response_model=AcceptCallResponse)
def accept_call(
    call_id: str,
    user_id: int = Depends(_user_id_from_token),
) -> AcceptCallResponse:
    return accept_call_for_user(call_id, user_id)


@router.post("/{call_id}/end")
def end_call(
    call_id: str,
    body: EndCallRequest,
    user_id: int = Depends(_user_id_from_token),
) -> dict:
    final_status = end_call_for_user(call_id, user_id, body.end_reason)
    return {"ok": True, "status": final_status}


@router.get("/{call_id}/status")
def call_status(
    call_id: str,
    user_id: int = Depends(_user_id_from_token),
) -> dict:
    """Return the current status of a call (e.g. 'initiated', 'answered',
    'rejected', 'missed', 'cancelled', 'completed').

    The attorney call screen polls this while waiting for the callee. It
    is the source of truth for non-Daily lifecycle transitions — Daily's
    `participant-joined` / `participant-left` events only cover the case
    where the callee actually joined the room, but they're silent when
    the callee declines from a killed app or when the server-side ring
    timeout fires.
    """
    status = get_call_status_for_user(call_id, user_id)
    return {"ok": True, "status": status}


@router.delete("/{call_id}")
def delete_call(
    call_id: str,
    user_id: int = Depends(_user_id_from_token),
) -> dict:
    delete_call_for_user(call_id, user_id)
    return {"ok": True}
