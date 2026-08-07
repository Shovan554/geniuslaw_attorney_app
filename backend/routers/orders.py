from fastapi import APIRouter, Depends

from middleware.auth_middleware import require_attorney_id
from models.order import OrderDetail
from services.orders_service import get_order_for_attorney

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("/{order_id}", response_model=OrderDetail)
def get_order(
    order_id: int,
    attorney_id: int = Depends(require_attorney_id),
) -> OrderDetail:
    """Case-less order lookup.

    The nested /cases/{case_id}/orders/{order_id} route stays the canonical
    one; this exists because an order alert carries only the order id, so the
    app has to resolve the case before it can open that nested screen.
    """
    return get_order_for_attorney(order_id, attorney_id)
