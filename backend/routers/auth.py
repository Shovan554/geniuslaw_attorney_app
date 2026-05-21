import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from middleware.auth_middleware import require_access_token
from models.user import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    LoginResponse,
    RefreshRequest,
    RefreshResponse,
    ResetPasswordRequest,
    TokenResponse,
    UserPublic,
    Verify2FARequest,
    VerifyOtpRequest,
)
from services.auth_service import (
    create_access_token,
    create_refresh_token,
    create_temp_2fa_token,
    decode_token,
    generate_otp_code,
    hash_password,
    otp_expiry,
    verify_password,
    verify_totp_code,
)
from services.email_service import send_password_reset_otp_email
from services.supabase_client import get_supabase

router = APIRouter(prefix="/auth", tags=["auth"])

USER_SELECT = "id,email,password_hash,role,firm_id,attorney_id,full_name,initials,totp_enabled,totp_secret_encrypted,change_password"
PUBLIC_USER_SELECT = "id,email,role,firm_id,attorney_id,full_name,initials"

ATTORNEY_ROLE = "attorney"
ADMIN_ROLE = "admin"


def _fetch_user_by_email(email: str) -> dict | None:
    sb = get_supabase()
    resp = sb.table("users").select(USER_SELECT).eq("email", email.strip().lower()).limit(1).execute()
    rows = resp.data or []
    return rows[0] if rows else None


def _attorney_email_exists(email: str | None) -> bool:
    if not email:
        return False
    sb = get_supabase()
    resp = (
        sb.table("attorneys")
        .select("id")
        .eq("email", email.strip().lower())
        .limit(1)
        .execute()
    )
    return bool(resp.data)


def _is_attorney_eligible(user: dict) -> bool:
    """Allow login for actual attorneys, plus admins who also have an attorney profile."""
    role = user.get("role")
    if role == ATTORNEY_ROLE:
        return True
    if role == ADMIN_ROLE:
        if user.get("attorney_id") is not None:
            return True
        return _attorney_email_exists(user.get("email"))
    return False


def _fetch_user_by_id(user_id: int) -> dict | None:
    sb = get_supabase()
    resp = sb.table("users").select(PUBLIC_USER_SELECT).eq("id", user_id).limit(1).execute()
    rows = resp.data or []
    return rows[0] if rows else None


def _touch_last_logged_in(user_id: int) -> None:
    try:
        sb = get_supabase()
        now_iso = datetime.now(timezone.utc).isoformat()
        sb.table("users").update({"last_logged_in": now_iso}).eq("id", user_id).execute()
    except Exception as exc:
        print(f"[auth] failed to update last_logged_in for user_id={user_id}: {exc!r}", flush=True)


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest) -> LoginResponse:
    user = _fetch_user_by_email(payload.email)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
    if not verify_password(payload.password, user.get("password_hash") or ""):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

    if not _is_attorney_eligible(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access is restricted to attorneys.")

    must_change = bool(user.get("change_password"))

    public_user = UserPublic(
        id=user["id"],
        email=user["email"],
        role=user["role"],
        firm_id=user.get("firm_id"),
        attorney_id=user.get("attorney_id"),
        full_name=user.get("full_name"),
        initials=user.get("initials"),
    )

    if int(user.get("totp_enabled") or 0) == 1:
        if not user.get("totp_secret_encrypted"):
            raise HTTPException(status_code=409, detail="2FA enabled but not configured. Contact your firm.")
        return LoginResponse(
            requires_2fa=True,
            temp_token=create_temp_2fa_token(user["id"], must_change_password=must_change),
            must_change_password=must_change,
        )

    _touch_last_logged_in(user["id"])
    return LoginResponse(
        requires_2fa=False,
        access_token=create_access_token(user["id"], user["role"]),
        refresh_token=create_refresh_token(user["id"]),
        user=public_user,
        must_change_password=must_change,
    )


@router.post("/2fa/verify", response_model=TokenResponse)
def verify_2fa(payload: Verify2FARequest) -> TokenResponse:
    token = decode_token(payload.temp_token, expected_type="2fa")
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired 2FA token.")
    must_change = bool(token.get("mcp", False))

    sb = get_supabase()
    resp = sb.table("users").select(USER_SELECT).eq("id", int(token["sub"])).limit(1).execute()
    rows = resp.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")
    user = rows[0]

    if not _is_attorney_eligible(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access is restricted to attorneys.")

    if not verify_totp_code(user["totp_secret_encrypted"], payload.totp_code):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect verification code.")

    public_user = UserPublic(
        id=user["id"],
        email=user["email"],
        role=user["role"],
        firm_id=user.get("firm_id"),
        attorney_id=user.get("attorney_id"),
        full_name=user.get("full_name"),
        initials=user.get("initials"),
    )
    _touch_last_logged_in(user["id"])
    return TokenResponse(
        access_token=create_access_token(user["id"], user["role"]),
        refresh_token=create_refresh_token(user["id"]),
        user=public_user,
        must_change_password=must_change,
    )


@router.post("/refresh", response_model=RefreshResponse)
def refresh(payload: RefreshRequest) -> RefreshResponse:
    token = decode_token(payload.refresh_token, expected_type="refresh")
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token.")
    user = _fetch_user_by_id(int(token["sub"]))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")
    return RefreshResponse(access_token=create_access_token(user["id"], user["role"]))


@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    token: dict = Depends(require_access_token),
) -> dict:
    user_id = int(token["sub"])

    sb = get_supabase()
    resp = sb.table("users").select("id,password_hash").eq("id", user_id).limit(1).execute()
    rows = resp.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    user = rows[0]

    if not verify_password(payload.current_password, user.get("password_hash") or ""):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect.")

    new_hash = hash_password(payload.new_password)
    sb.table("users").update({"password_hash": new_hash, "change_password": False}).eq("id", user_id).execute()

    return {"success": True}


@router.get("/me", response_model=UserPublic)
def me(payload: dict = Depends(require_access_token)) -> UserPublic:
    user = _fetch_user_by_id(int(payload["sub"]))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return UserPublic(**user)


_GENERIC_FORGOT_RESPONSE = {
    "success": True,
    "message": "If an account exists for that email, a reset code has been sent.",
}


def _parse_otp_expiry(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest) -> dict:
    email = payload.email.strip().lower()
    sb = get_supabase()
    resp = sb.table("users").select("id,email,role,attorney_id,full_name").eq("email", email).limit(1).execute()
    rows = resp.data or []
    user = rows[0] if rows else None

    if not user or not _is_attorney_eligible(user):
        return _GENERIC_FORGOT_RESPONSE

    code = generate_otp_code()
    expires = otp_expiry(minutes=10)
    sb.table("users").update({
        "otp_code": code,
        "otp_expires_at": expires.isoformat(),
    }).eq("id", user["id"]).execute()

    ok, err = await send_password_reset_otp_email(
        to_email=user["email"],
        full_name=user.get("full_name"),
        otp_code=code,
    )
    if not ok:
        print(f"[auth.forgot_password] email send failed: {err}", flush=True)

    return _GENERIC_FORGOT_RESPONSE


def _validate_otp(email: str, otp_code: str) -> dict:
    sb = get_supabase()
    resp = (
        sb.table("users")
        .select("id,email,role,attorney_id,otp_code,otp_expires_at")
        .eq("email", email.strip().lower())
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code.")
    user = rows[0]
    if not _is_attorney_eligible(user):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code.")

    stored = user.get("otp_code")
    expires = _parse_otp_expiry(user.get("otp_expires_at"))
    if not stored or not expires:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code.")

    if datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code.")

    if not secrets.compare_digest(stored, otp_code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired code.")

    return user


@router.post("/verify-otp")
def verify_otp(payload: VerifyOtpRequest) -> dict:
    _validate_otp(payload.email, payload.otp_code)
    return {"success": True}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest) -> dict:
    user = _validate_otp(payload.email, payload.otp_code)

    new_hash = hash_password(payload.new_password)
    sb = get_supabase()
    sb.table("users").update({
        "password_hash": new_hash,
        "otp_code": None,
        "otp_expires_at": None,
        "change_password": False,
    }).eq("id", user["id"]).execute()

    return {"success": True}
