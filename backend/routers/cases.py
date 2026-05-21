from fastapi import APIRouter, Depends, HTTPException, Query, status

from middleware.auth_middleware import require_attorney_id
from models.case import CaseListResponse, CaseSummary
from models.order import OrderListResponse
from services.cases_service import get_case_for_attorney, list_cases_for_attorney
from services.orders_service import list_orders_for_case_attorney

router = APIRouter(prefix="/cases", tags=["cases"])


@router.get("", response_model=CaseListResponse)
def list_cases(
    exclude_closed: bool = Query(False),
    limit: int | None = Query(None, ge=1, le=200),
    client_id: int | None = Query(None, ge=1),
    attorney_id: int = Depends(require_attorney_id),
) -> CaseListResponse:
    cases = list_cases_for_attorney(
        attorney_id,
        exclude_closed=exclude_closed,
        limit=limit,
        client_id=client_id,
    )
    return CaseListResponse(cases=cases)


@router.get("/{case_id}", response_model=CaseSummary)
def get_case(
    case_id: int,
    attorney_id: int = Depends(require_attorney_id),
) -> CaseSummary:
    case = get_case_for_attorney(case_id, attorney_id)
    if not case:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found.")
    return case


@router.get("/{case_id}/orders", response_model=OrderListResponse)
def list_orders(
    case_id: int,
    attorney_id: int = Depends(require_attorney_id),
) -> OrderListResponse:
    orders = list_orders_for_case_attorney(case_id, attorney_id)
    return OrderListResponse(orders=orders)
