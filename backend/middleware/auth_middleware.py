from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from services.auth_service import decode_token
from services.supabase_client import get_supabase

bearer_scheme = HTTPBearer(auto_error=False)


async def require_access_token(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    payload = decode_token(creds.credentials, expected_type="access")
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    return payload


async def require_attorney_role(payload: dict = Depends(require_access_token)) -> dict:
    if payload.get("role") not in ("attorney", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Attorney role required")
    return payload


async def require_attorney_id(token: dict = Depends(require_attorney_role)) -> int:
    """Resolve the authenticated user's attorney_id.

    Prefers users.attorney_id; falls back to email lookup against the attorneys table
    so legacy users without the foreign key populated still resolve correctly.
    """
    user_id = int(token["sub"])
    sb = get_supabase()
    user_resp = (
        sb.table("users")
        .select("attorney_id,email")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    rows = user_resp.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    attorney_id = rows[0].get("attorney_id")
    if attorney_id is not None:
        return int(attorney_id)

    email = rows[0].get("email")
    if not email:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attorney profile not linked.")

    att_resp = (
        sb.table("attorneys")
        .select("id")
        .eq("email", email.strip().lower())
        .limit(1)
        .execute()
    )
    att_rows = att_resp.data or []
    if not att_rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attorney profile not found.")
    return int(att_rows[0]["id"])
