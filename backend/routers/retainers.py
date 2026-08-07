from fastapi import APIRouter, Depends, HTTPException, status

from middleware.auth_middleware import require_attorney_id
from models.retainer import RetainerListResponse, RetainerSummary
from services.retainers_service import (
    get_retainer_for_attorney,
    list_retainers_for_attorney,
)

router = APIRouter(prefix="/retainers", tags=["retainers"])


@router.get("", response_model=RetainerListResponse)
def list_retainers(
    attorney_id: int = Depends(require_attorney_id),
) -> RetainerListResponse:
    retainers = list_retainers_for_attorney(attorney_id)
    return RetainerListResponse(retainers=retainers)


@router.get("/{retainer_id}", response_model=RetainerSummary)
def get_retainer(
    retainer_id: str,
    attorney_id: int = Depends(require_attorney_id),
) -> RetainerSummary:
    retainer = get_retainer_for_attorney(retainer_id, attorney_id)
    if retainer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Retainer not found."
        )
    return retainer
