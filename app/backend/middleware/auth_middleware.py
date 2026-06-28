"""
Auth middleware — verifies Prism JWT on every protected route.
(Firebase has been removed; tokens are issued by /api/auth/verify-otp)
"""
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from config import verify_access_token
from services import firebase_service as fb

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """
    Dependency that extracts & verifies the Prism JWT.
    Returns the decoded token dict (contains uid, phone, etc.)
    """
    token = credentials.credentials
    try:
        decoded = verify_access_token(token)
        return decoded
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """
    Dependency that additionally checks isAdmin flag in the database.
    Frontend visibility is NOT sufficient — this is the server-side gate.
    """
    uid = user.get("uid")
    user_data = fb.get_user(uid)
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")

    if not user_data.get("isAdmin", False):
        raise HTTPException(status_code=403, detail="Admin access required")

    user["user_data"] = user_data
    return user
