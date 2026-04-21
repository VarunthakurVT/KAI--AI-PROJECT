"""
NEXUS Backend – Auth API Endpoints

POST /v1/auth/register  → create a new user
POST /v1/auth/login     → return JWT access token
GET  /v1/me             → return current user profile
"""

import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import User
from app.auth.security import hash_password, verify_password
from app.auth.jwt import create_access_token
from app.schemas.auth import (
    GoogleOAuthRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)
from app.dependencies import get_current_user
from app.config import settings

router = APIRouter()


def _token_response_for(user: User) -> TokenResponse:
    token = create_access_token(subject=str(user.id))
    return TokenResponse(
        access_token=token,
        expires_in=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


async def require_internal_oauth_request(
    x_auth_bff_secret: str | None = Header(None),
) -> None:
    """Restrict Google OAuth account linking/login to the Auth-BFF."""
    expected_secret = settings.AUTH_BFF_SHARED_SECRET
    if not expected_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured on the backend",
        )

    if not x_auth_bff_secret or not secrets.compare_digest(x_auth_bff_secret, expected_secret):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden",
        )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user account."""
    # Check if email already exists
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    # Create user
    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
    )
    db.add(user)
    await db.flush()  # get the user.id
    await db.commit()  # commit the transaction

    return _token_response_for(user)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate and return a JWT token."""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    return _token_response_for(user)


@router.post("/oauth/google", response_model=TokenResponse)
async def google_oauth_login(
    body: GoogleOAuthRequest,
    _internal_only: None = Depends(require_internal_oauth_request),
    db: AsyncSession = Depends(get_db),
):
    """Create or log in a user from a verified Google identity."""
    if not body.email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account email is not verified",
        )

    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    cleaned_name = body.display_name.strip() if body.display_name else None
    if cleaned_name == "":
        cleaned_name = None

    if user is None:
        fallback_name = cleaned_name or body.email.split("@", 1)[0]
        user = User(
            email=body.email,
            password_hash=hash_password(secrets.token_urlsafe(32)),
            display_name=fallback_name[:100] if fallback_name else None,
        )
        db.add(user)
        await db.flush()
        await db.commit()
        await db.refresh(user)
        return _token_response_for(user)

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated",
        )

    if cleaned_name and not user.display_name:
        user.display_name = cleaned_name[:100]
        await db.commit()

    return _token_response_for(user)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the current authenticated user's profile."""
    return current_user
