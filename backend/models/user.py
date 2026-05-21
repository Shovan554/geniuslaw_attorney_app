from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field


Role = Literal["attorney", "admin", "staff", "accounting", "client"]


class UserPublic(BaseModel):
    id: int
    email: EmailStr
    role: Role
    firm_id: Optional[int] = None
    attorney_id: Optional[int] = None
    full_name: Optional[str] = None
    initials: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class LoginResponse(BaseModel):
    requires_2fa: bool
    temp_token: Optional[str] = None
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    user: Optional[UserPublic] = None
    must_change_password: bool = False


class Verify2FARequest(BaseModel):
    temp_token: str
    totp_code: str = Field(min_length=6, max_length=6)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: UserPublic
    must_change_password: bool = False


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp_code: str = Field(min_length=6, max_length=6)


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp_code: str = Field(min_length=6, max_length=6)
    new_password: str = Field(min_length=8)
