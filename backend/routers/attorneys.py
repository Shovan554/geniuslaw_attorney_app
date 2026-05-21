from fastapi import APIRouter, Depends, HTTPException, status

from middleware.auth_middleware import require_attorney_role
from models.attorney import AttorneyProfile, AttorneyProfileUpdate
from services.supabase_client import get_supabase

router = APIRouter(prefix="/attorneys", tags=["attorneys"])

ATTORNEY_SELECT = "id,firm_id,full_name,email,phone,address,bar_number,title,bio,status"


def _fetch_user_email(user_id: int) -> str | None:
    sb = get_supabase()
    resp = sb.table("users").select("email").eq("id", user_id).limit(1).execute()
    rows = resp.data or []
    return rows[0]["email"] if rows else None


def _fetch_attorney_by_email(email: str) -> dict | None:
    sb = get_supabase()
    resp = (
        sb.table("attorneys")
        .select(ATTORNEY_SELECT)
        .eq("email", email.strip().lower())
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    return rows[0] if rows else None


def _fetch_firm_name(firm_id: int) -> str | None:
    sb = get_supabase()
    resp = sb.table("law_firms").select("name").eq("id", firm_id).limit(1).execute()
    rows = resp.data or []
    return rows[0]["name"] if rows else None


def _profile_from_row(row: dict) -> AttorneyProfile:
    firm_name = _fetch_firm_name(row["firm_id"])
    return AttorneyProfile(**row, firm_name=firm_name)


@router.get("/me", response_model=AttorneyProfile)
def get_me(token: dict = Depends(require_attorney_role)) -> AttorneyProfile:
    user_id = int(token["sub"])
    email = _fetch_user_email(user_id)
    if not email:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    attorney = _fetch_attorney_by_email(email)
    if not attorney:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attorney profile not found.")

    return _profile_from_row(attorney)


@router.patch("/me", response_model=AttorneyProfile)
def update_me(
    payload: AttorneyProfileUpdate,
    token: dict = Depends(require_attorney_role),
) -> AttorneyProfile:
    user_id = int(token["sub"])
    current_email = _fetch_user_email(user_id)
    if not current_email:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    attorney = _fetch_attorney_by_email(current_email)
    if not attorney:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attorney profile not found.")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return _profile_from_row(attorney)

    new_email = updates.get("email")
    if isinstance(new_email, str):
        new_email = new_email.strip().lower()
        updates["email"] = new_email

    sb = get_supabase()

    if new_email and new_email != current_email:
        conflict = (
            sb.table("users")
            .select("id")
            .eq("email", new_email)
            .neq("id", user_id)
            .limit(1)
            .execute()
        )
        if conflict.data:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="That email is already in use.",
            )

    sb.table("attorneys").update(updates).eq("id", attorney["id"]).execute()

    user_updates: dict = {}
    if new_email and new_email != current_email:
        user_updates["email"] = new_email
    if "full_name" in updates and updates["full_name"]:
        user_updates["full_name"] = updates["full_name"]
    if user_updates:
        sb.table("users").update(user_updates).eq("id", user_id).execute()

    refreshed = _fetch_attorney_by_email(new_email or current_email)
    if not refreshed:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to load updated profile.")
    return _profile_from_row(refreshed)
