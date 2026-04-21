"""
NEXUS Backend – Auth Schemas

Pydantic models for authentication request/response.
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from uuid import UUID
from datetime import datetime


# ── Request ──

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    display_name: Optional[str] = Field(None, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleOAuthRequest(BaseModel):
    email: EmailStr
    email_verified: bool = True
    display_name: Optional[str] = Field(None, max_length=100)
    google_sub: str = Field(..., min_length=1, max_length=255)
    avatar_url: Optional[str] = Field(None, max_length=2048)


# ── Response ──

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class UserResponse(BaseModel):
    id: UUID
    email: str
    display_name: Optional[str]
    created_at: datetime
    is_active: bool

    model_config = {"from_attributes": True}
