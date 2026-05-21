from fastapi import APIRouter, Depends, HTTPException, status

from middleware.auth_middleware import require_attorney_id
from models.client import ClientListResponse, ClientSummary
from services.clients_service import (
    get_client_for_attorney,
    list_clients_for_attorney,
)

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("", response_model=ClientListResponse)
def list_clients(attorney_id: int = Depends(require_attorney_id)) -> ClientListResponse:
    clients = list_clients_for_attorney(attorney_id)
    return ClientListResponse(clients=clients)


@router.get("/{client_id}", response_model=ClientSummary)
def get_client(
    client_id: int,
    attorney_id: int = Depends(require_attorney_id),
) -> ClientSummary:
    client = get_client_for_attorney(client_id, attorney_id)
    if client is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Client not found.")
    return client
