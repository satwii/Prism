"""
Pydantic schemas for request / response validation.
"""
from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum


# ──────────────────────────────────────────────
# Enums
# ──────────────────────────────────────────────
class Gender(str, Enum):
    male = "male"
    female = "female"
    prefer_not_to_say = "prefer_not_to_say"


class ThreatStatus(str, Enum):
    SAFE = "SAFE"
    SUSPICIOUS = "SUSPICIOUS"
    PHISHING = "PHISHING"
    GROOMING = "GROOMING"
    SOCIAL_ENGINEERING = "SOCIAL_ENGINEERING"
    BLOCKED_VECTOR = "BLOCKED_VECTOR"
    BLOCKED_URL = "BLOCKED_URL"
    INTEGRITY_FAIL = "INTEGRITY_FAIL"


class AnalysisMethod(str, Enum):
    distilbert = "distilbert"
    chromadb = "chromadb"
    blocklist = "blocklist"
    bypass = "bypass"


class ReportStatus(str, Enum):
    pending = "pending"
    confirmed = "confirmed"
    false_positive = "false_positive"


class OrgStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


# ──────────────────────────────────────────────
# Auth / Registration
# ──────────────────────────────────────────────
class UserRegisterRequest(BaseModel):
    displayName: str = Field(..., min_length=2, max_length=50)
    phoneHash: str
    gender: Gender
    age: int = Field(..., ge=13, le=120)
    emergencyContactName: str = Field(..., min_length=2)
    emergencyContactPhone: str = Field(..., min_length=6)


class UserResponse(BaseModel):
    uid: str
    displayName: str
    gender: str
    age: int
    tripCount: int = 0
    isAdmin: bool = False
    createdAt: Optional[str] = None
    emergencyContactName: Optional[str] = None


class UserUpdateRequest(BaseModel):
    displayName: Optional[str] = None
    emergencyContactName: Optional[str] = None
    emergencyContactPhone: Optional[str] = None


# ──────────────────────────────────────────────
# Chat & Messages
# ──────────────────────────────────────────────
class NewChatRequest(BaseModel):
    contactPhoneHash: str


class SendMessageRequest(BaseModel):
    chatId: str
    ciphertext: str
    signature: str


class AnalyzeRequest(BaseModel):
    message: str
    chat_id: str
    sender_id: str


class AnalyzeResponse(BaseModel):
    status: ThreatStatus
    confidence: float = 0.0
    method: AnalysisMethod
    matched_pattern: Optional[str] = None
    buffer_active: bool = False


class ChatPermissionUpdate(BaseModel):
    chatPartnerId: str
    aiScanGranted: bool


class MessageResponse(BaseModel):
    id: str
    chatId: str
    senderId: str
    ciphertext: str
    signature: Optional[str] = None
    sentAt: str
    threatStatus: Optional[str] = None
    confidence: Optional[float] = None
    method: Optional[str] = None
    plaintext: Optional[str] = None


# ──────────────────────────────────────────────
# Reports
# ──────────────────────────────────────────────
class ScamReportRequest(BaseModel):
    messageContent: str
    chatId: str


class ScamReportResponse(BaseModel):
    id: str
    reportedBy: str
    messageContent: str
    reportedAt: str
    status: str
    reviewedBy: Optional[str] = None
    chromaId: Optional[str] = None


# ──────────────────────────────────────────────
# Organizations
# ──────────────────────────────────────────────
class OrgRegisterRequest(BaseModel):
    name: str = Field(..., min_length=2)
    regNumber: str = Field(..., min_length=4)
    website: str
    adminContactPhone: str


class OrgResponse(BaseModel):
    uid: str
    name: str
    regNumber: str
    website: str
    logoUrl: Optional[str] = None
    verified: bool = False
    rejectionNote: Optional[str] = None
    createdAt: Optional[str] = None


class OrgRejectRequest(BaseModel):
    rejectionNote: str = Field(..., min_length=5)


# ──────────────────────────────────────────────
# Ratings
# ──────────────────────────────────────────────
class RatingRequest(BaseModel):
    ratedUser: str
    sessionId: str
    stars: int = Field(..., ge=1, le=5)
    note: Optional[str] = None


class RatingResponse(BaseModel):
    averageRating: float
    totalRatings: int


# ──────────────────────────────────────────────
# Admin
# ──────────────────────────────────────────────
class AdminActionResponse(BaseModel):
    success: bool
    message: str


class BlocklistAddRequest(BaseModel):
    domain: str = Field(..., min_length=3)


# ──────────────────────────────────────────────
# DH Key Exchange
# ──────────────────────────────────────────────
class DHPublicKeyRequest(BaseModel):
    chatId: str
    publicKey: int


class DHPublicKeyResponse(BaseModel):
    publicKey: int


# ──────────────────────────────────────────────
# Contact lookup
# ──────────────────────────────────────────────
class ContactLookupRequest(BaseModel):
    phoneHash: str


class ContactLookupResponse(BaseModel):
    found: bool
    displayName: Optional[str] = None
    uid: Optional[str] = None
