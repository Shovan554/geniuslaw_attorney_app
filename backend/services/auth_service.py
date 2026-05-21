import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

import pyotp
from cryptography.fernet import Fernet, InvalidToken
from jose import JWTError, jwt
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-change-me")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
JWT_EXPIRY_MINUTES = int(os.environ.get("JWT_EXPIRY_MINUTES", "525600"))
JWT_REFRESH_EXPIRY_DAYS = int(os.environ.get("JWT_REFRESH_EXPIRY_DAYS", "3650"))

_TEMP_TOKEN_EXPIRY_MINUTES = 5

_fernet: Fernet | None = None


def _get_fernet() -> Fernet | None:
    global _fernet
    if _fernet is not None:
        return _fernet
    key = os.environ.get("TOTP_ENCRYPTION_KEY", "").strip()
    if not key:
        return None
    _fernet = Fernet(key.encode())
    return _fernet


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(plain, hashed)
    except Exception:
        return False


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def decrypt_totp_secret(encrypted: str) -> str:
    f = _get_fernet()
    if f is None:
        return encrypted
    try:
        return f.decrypt(encrypted.encode()).decode()
    except InvalidToken:
        return encrypted


def verify_totp_code(encrypted_secret: str, code: str) -> bool:
    secret = decrypt_totp_secret(encrypted_secret)
    return pyotp.TOTP(secret).verify(code, valid_window=1)


def _encode(payload: dict[str, Any], expires: timedelta) -> str:
    now = datetime.now(timezone.utc)
    data = {**payload, "iat": int(now.timestamp()), "exp": int((now + expires).timestamp())}
    return jwt.encode(data, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_access_token(user_id: int, role: str) -> str:
    return _encode({"sub": str(user_id), "role": role, "type": "access"}, timedelta(minutes=JWT_EXPIRY_MINUTES))


def create_refresh_token(user_id: int) -> str:
    return _encode({"sub": str(user_id), "type": "refresh"}, timedelta(days=JWT_REFRESH_EXPIRY_DAYS))


def create_temp_2fa_token(user_id: int, must_change_password: bool = False) -> str:
    return _encode(
        {"sub": str(user_id), "type": "2fa", "mcp": bool(must_change_password)},
        timedelta(minutes=_TEMP_TOKEN_EXPIRY_MINUTES),
    )


def decode_token(token: str, expected_type: str | None = None) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        return None
    if expected_type and payload.get("type") != expected_type:
        return None
    return payload


def generate_otp_code() -> str:
    """Cryptographically random 6-digit numeric OTP, zero-padded."""
    return f"{secrets.randbelow(1_000_000):06d}"


def otp_expiry(minutes: int = 10) -> datetime:
    """UTC timestamp `minutes` from now, used for otp_expires_at."""
    return datetime.now(timezone.utc) + timedelta(minutes=minutes)
