from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class AttorneyProfile(BaseModel):
    id: int
    firm_id: int
    full_name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    bar_number: Optional[str] = None
    title: Optional[str] = None
    bio: Optional[str] = None
    status: Optional[str] = None
    firm_name: Optional[str] = None


class AttorneyProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, max_length=50)
    address: Optional[str] = Field(default=None, max_length=500)
    bar_number: Optional[str] = Field(default=None, max_length=100)
    bio: Optional[str] = Field(default=None, max_length=5000)
