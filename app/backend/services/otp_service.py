"""
OTP Service — Dev/custom mode.
Generates a 6-digit OTP, stores it in memory, and prints it to
the backend terminal. No SMS is sent — check the running server logs.
"""
import random
import datetime

# { phone_number: {"otp": str, "expires": datetime} }
_store: dict = {}
_EXPIRY_MINUTES = 5


def generate_and_store(phone: str) -> str:
    """Generate a fresh OTP for the given phone number and cache it."""
    otp = f"{random.randint(100000, 999999)}"
    _store[phone] = {
        "otp": otp,
        "expires": datetime.datetime.utcnow() + datetime.timedelta(minutes=_EXPIRY_MINUTES),
    }
    return otp


def verify_and_consume(phone: str, otp: str) -> bool:
    """
    Verify the OTP. Returns True on success and deletes the entry (one-time use).
    Returns False if not found, expired, or wrong code.
    """
    entry = _store.get(phone)
    if not entry:
        return False
    if datetime.datetime.utcnow() > entry["expires"]:
        _store.pop(phone, None)
        return False
    if entry["otp"] != otp:
        return False
    _store.pop(phone, None)   # Consume — one-time use
    return True
