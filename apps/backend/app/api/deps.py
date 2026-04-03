from fastapi import Depends, Header, HTTPException, status

from app.core.security import AuthUser, decode_supabase_token, token_payload_to_user


async def get_current_user(authorization: str | None = Header(default=None)) -> AuthUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    token = authorization.replace("Bearer ", "", 1).strip()
    payload = decode_supabase_token(token)
    return token_payload_to_user(payload)


CurrentUser = Depends(get_current_user)
