from fastapi import HTTPException, status
from jose import JWTError, jwt
import httpx

from app.core.config import get_settings


class AuthUser:
    def __init__(self, user_id: str, email: str | None, role: str) -> None:
        self.user_id = user_id
        self.email = email
        self.role = role


def _remote_verify_with_supabase(token: str) -> dict:
    settings = get_settings()
    if not settings.supabase_url or not settings.supabase_anon_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )

    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/user"
    headers = {
        "apikey": settings.supabase_anon_key,
        "Authorization": f"Bearer {token}",
    }

    try:
        response = httpx.get(url, headers=headers, timeout=10.0)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        ) from exc

    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
        )

    user_data = response.json()
    # Normalize into payload-like structure for downstream mapping.
    return {
        "sub": user_data.get("id"),
        "email": user_data.get("email"),
        "user_metadata": user_data.get("user_metadata") or {},
        "app_metadata": user_data.get("app_metadata") or {},
    }


def decode_supabase_token(token: str) -> dict:
    settings = get_settings()

    # Prefer local decode when legacy JWT secret is configured.
    if settings.supabase_jwt_secret:
        try:
            return jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience=settings.supabase_jwt_audience,
                options={"verify_aud": True},
            )
        except JWTError:
            # Fall back to remote verification for projects using newer signing keys.
            return _remote_verify_with_supabase(token)

    # If no local JWT secret is available, use Supabase auth endpoint verification.
    return _remote_verify_with_supabase(token)


def token_payload_to_user(payload: dict) -> AuthUser:
    user_id = payload.get("sub")
    role = payload.get("user_metadata", {}).get("role") or payload.get("app_metadata", {}).get("role") or "student"
    email = payload.get("email")

    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token subject")

    return AuthUser(user_id=user_id, email=email, role=role)
