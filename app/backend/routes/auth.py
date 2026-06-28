"""
Auth Routes — OTP send/verify (no Firebase), registration, login, profile management.
"""
import hashlib
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from middleware.auth_middleware import get_current_user
from models.schemas import (
    UserRegisterRequest, UserResponse,
    UserUpdateRequest, ContactLookupRequest, ContactLookupResponse,
    DHPublicKeyRequest, DHPublicKeyResponse,
    RatingRequest, RatingResponse,
)
from services import firebase_service as fb
from services.encryption import rsa_generate_keypair, dh_generate_keypair, sha256_hash
from services.otp_service import generate_and_store, verify_and_consume
from config import create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── OTP Request / Verify Models ──
class OtpSendRequest(BaseModel):
    phone: str

class OtpVerifyRequest(BaseModel):
    phone: str
    otp: str


@router.post("/send-otp")
async def send_otp(data: OtpSendRequest):
    """
    DEV MODE: Generate a 6-digit OTP and print it to the backend terminal.
    No SMS is sent — check the server logs for the OTP.
    """
    otp = generate_and_store(data.phone)
    # ── Print OTP clearly to backend logs ──
    print("\n" + "=" * 52)
    print("  ✉️  OTP REQUEST")
    print(f"  Phone  : {data.phone}")
    print(f"  OTP    : {otp}")
    print(f"  Expiry : 5 minutes")
    print("=" * 52 + "\n")
    return {"success": True, "message": "OTP generated — check backend terminal logs."}


@router.get("/debug-otp")
async def debug_get_otp(phone: str):
    """
    DEV ONLY — Returns the stored OTP for a given phone number.
    ⚠️  REMOVE BEFORE PRODUCTION DEPLOYMENT.
    """
    from services.otp_service import _store
    entry = _store.get(phone)
    if entry:
        return {"otp": entry["otp"], "phone": phone}
    raise HTTPException(status_code=404, detail="No pending OTP for this phone")


@router.post("/verify-otp")
async def verify_otp(data: OtpVerifyRequest):
    """
    Verify the OTP. Returns a signed JWT token on success.
    The token must be sent as Authorization: Bearer <token> on all subsequent requests.
    """
    valid = verify_and_consume(data.phone, data.otp)
    if not valid:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    token = create_access_token(data.phone)
    uid = hashlib.sha256(data.phone.encode()).hexdigest()
    return {"token": token, "uid": uid}


@router.post("/register", response_model=UserResponse)
async def register_user(
    data: UserRegisterRequest,
    user: dict = Depends(get_current_user),
):
    """
    Register a new user after Firebase phone OTP verification.
    Firebase ID Token must be provided in the Authorization header.
    """
    uid = user["uid"]
    # Check age gate
    if data.age < 13:
        raise HTTPException(
            status_code=403,
            detail="Prism is not available for users under 13.",
        )
    # Check if user already exists
    existing = fb.get_user(uid)
    if existing:
        raise HTTPException(status_code=409, detail="User already registered")

    user_data = fb.create_user(uid, data.model_dump())

    # Generate RSA key pair — public key goes to DB
    private_pem, public_pem = rsa_generate_keypair()
    fb.store_rsa_public_key(uid, public_pem.decode("utf-8"))

    return UserResponse(
        uid=uid,
        displayName=data.displayName,
        gender=data.gender.value,
        age=data.age,
        tripCount=0,
        isAdmin=False,
        emergencyContactName=data.emergencyContactName,
    )



@router.get("/me", response_model=UserResponse)
async def get_current_profile(user: dict = Depends(get_current_user)):
    """Get the current user's profile."""
    uid = user["uid"]
    user_data = fb.get_user(uid)
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")

    # Convert Firestore timestamp
    created_at = user_data.get("createdAt")
    created_str = str(created_at) if created_at else None

    return UserResponse(
        uid=uid,
        displayName=user_data["displayName"],
        gender=user_data["gender"],
        age=user_data["age"],
        tripCount=user_data.get("tripCount", 0),
        isAdmin=user_data.get("isAdmin", False),
        createdAt=created_str,
        emergencyContactName=user_data.get("emergencyContactName"),
    )


@router.put("/me")
async def update_profile(
    data: UserUpdateRequest,
    user: dict = Depends(get_current_user),
):
    """Update current user's profile."""
    uid = user["uid"]
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    fb.update_user(uid, updates)
    return {"success": True}


@router.post("/lookup", response_model=ContactLookupResponse)
async def lookup_contact(
    data: ContactLookupRequest,
    user: dict = Depends(get_current_user),
):
    """
    Lookup a user by phone hash. Returns display name only.
    Phone number is NEVER returned in the API response.
    """
    result = fb.lookup_user_by_phone_hash(data.phoneHash)
    if result:
        return ContactLookupResponse(
            found=True,
            displayName=result["displayName"],
            uid=result["uid"],
        )
    return ContactLookupResponse(found=False)


@router.post("/contacts/add")
async def add_contact(
    data: ContactLookupRequest,
    user: dict = Depends(get_current_user),
):
    """Add a contact by phone hash."""
    uid = user["uid"]
    fb.add_contact(uid, data.phoneHash)
    return {"success": True}


@router.get("/contacts")
async def get_contacts(user: dict = Depends(get_current_user)):
    """Get the current user's contacts."""
    uid = user["uid"]
    contacts = fb.get_contacts(uid)
    return {"contacts": contacts}


@router.get("/user/{uid}")
async def get_user_info(uid: str, user: dict = Depends(get_current_user)):
    """
    Get another user's public profile info.
    Returns only displayName and phoneHash — never the plaintext phone number.
    Used by the frontend to add a chat partner as a contact.
    """
    target = fb.get_user(uid)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    # Return only public, non-sensitive fields
    return {
        "uid": target["uid"],
        "displayName": target["displayName"],
        "phoneHash": target.get("phoneHash"),  # hash only, never the raw phone
    }


@router.post("/ratings")
async def rate_user(
    data: RatingRequest,
    user: dict = Depends(get_current_user),
):
    """Rate another user after a chat session."""
    uid = user["uid"]
    if uid == data.ratedUser:
        raise HTTPException(status_code=400, detail="Cannot rate yourself")
    fb.create_rating(uid, data.ratedUser, data.sessionId, data.stars, data.note)
    fb.increment_trip_count(uid)
    fb.increment_trip_count(data.ratedUser)
    return {"success": True}


@router.get("/ratings/{user_id}", response_model=RatingResponse)
async def get_ratings(user_id: str, user: dict = Depends(get_current_user)):
    """Get average rating for a user."""
    return fb.get_user_ratings(user_id)


@router.post("/rsa-public-key")
async def store_rsa_key(
    user: dict = Depends(get_current_user),
):
    """
    Generate and store RSA public key. Private key returned ONCE to client.
    Client must store private key locally — it is NEVER stored on server.
    """
    uid = user["uid"]
    private_pem, public_pem = rsa_generate_keypair()
    fb.store_rsa_public_key(uid, public_pem.decode("utf-8"))

    return {
        "publicKey": public_pem.decode("utf-8"),
        "privateKey": private_pem.decode("utf-8"),
        "warning": "Store this private key securely on your device. It will NOT be shown again.",
    }
