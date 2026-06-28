"""
Prism Backend Configuration
SQLite for database (ZERO setup). Custom JWT-based auth (no Firebase).
"""
import os
import sqlite3
import hashlib
import datetime
from jose import jwt, JWTError

# ──────────────────────────────────────────────
# SQLite Configuration (FREE — zero setup, just a file)
# ──────────────────────────────────────────────
DB_PATH = os.getenv(
    "DB_PATH",
    os.path.join(os.path.dirname(__file__), "prism.db"),
)

_connection = None


def get_db():
    """Return a SQLite connection (auto-creates file if needed)."""
    global _connection
    if _connection is None:
        _connection = sqlite3.connect(DB_PATH, check_same_thread=False)
        _connection.row_factory = sqlite3.Row  # dict-like access
        _connection.execute("PRAGMA journal_mode=WAL")
        _connection.execute("PRAGMA foreign_keys=ON")
    return _connection


def init_database():
    """Create all tables. Safe to call multiple times (IF NOT EXISTS)."""
    db = get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            uid TEXT PRIMARY KEY,
            displayName TEXT NOT NULL,
            phoneHash TEXT UNIQUE,
            gender TEXT,
            age INTEGER,
            emergencyContactName TEXT,
            emergencyContactPhone TEXT,
            tripCount INTEGER DEFAULT 0,
            isAdmin INTEGER DEFAULT 0,
            createdAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            contactPhoneHash TEXT NOT NULL,
            addedAt TEXT DEFAULT (datetime('now')),
            UNIQUE(userId, contactPhoneHash)
        );

        CREATE TABLE IF NOT EXISTS chat_permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId TEXT NOT NULL,
            chatPartnerId TEXT NOT NULL,
            aiScanGranted INTEGER DEFAULT 1,
            updatedAt TEXT DEFAULT (datetime('now')),
            UNIQUE(userId, chatPartnerId)
        );

        CREATE TABLE IF NOT EXISTS chats (
            chatId TEXT PRIMARY KEY,
            participant1 TEXT NOT NULL,
            participant2 TEXT NOT NULL,
            lastMessage TEXT,
            lastMessageAt TEXT DEFAULT (datetime('now')),
            createdAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            chatId TEXT NOT NULL,
            senderId TEXT NOT NULL,
            ciphertext TEXT,
            plaintext TEXT,
            signature TEXT,
            sentAt TEXT DEFAULT (datetime('now')),
            threatStatus TEXT,
            confidence REAL,
            method TEXT
        );

        CREATE TABLE IF NOT EXISTS sus_buffer (
            chatId TEXT PRIMARY KEY,
            messages TEXT,
            lastUpdated TEXT DEFAULT (datetime('now')),
            messageCount INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS scam_reports (
            id TEXT PRIMARY KEY,
            reportedBy TEXT NOT NULL,
            messageContent TEXT,
            chatId TEXT,
            reportedAt TEXT DEFAULT (datetime('now')),
            status TEXT DEFAULT 'pending',
            reviewedBy TEXT,
            chromaId TEXT
        );

        CREATE TABLE IF NOT EXISTS organizations (
            uid TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            regNumber TEXT,
            website TEXT,
            logoUrl TEXT,
            adminContactPhone TEXT,
            verified INTEGER DEFAULT 0,
            rejectionNote TEXT,
            createdAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS blocklist (
            id TEXT PRIMARY KEY,
            domain TEXT NOT NULL,
            addedBy TEXT,
            addedAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS ratings (
            id TEXT PRIMARY KEY,
            sessionId TEXT,
            ratedBy TEXT NOT NULL,
            ratedUser TEXT NOT NULL,
            stars INTEGER NOT NULL,
            note TEXT,
            createdAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS admin_logs (
            id TEXT PRIMARY KEY,
            adminId TEXT NOT NULL,
            action TEXT NOT NULL,
            targetId TEXT,
            timestamp TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS dh_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chatId TEXT NOT NULL,
            userId TEXT NOT NULL,
            publicKey INTEGER,
            createdAt TEXT DEFAULT (datetime('now')),
            UNIQUE(chatId, userId)
        );

        CREATE TABLE IF NOT EXISTS rsa_keys (
            uid TEXT PRIMARY KEY,
            publicKeyPem TEXT,
            createdAt TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS vector_metadata (
            id TEXT PRIMARY KEY,
            originalText TEXT,
            addedBy TEXT,
            addedAt TEXT DEFAULT (datetime('now')),
            chromaId TEXT
        );
    """)
    db.commit()
    print(f"  ✓ SQLite database ready — {DB_PATH}")


# ──────────────────────────────────────────────
# Firebase Admin — ONLY for phone auth token verification
# ──────────────────────────────────────────────
SERVICE_ACCOUNT_PATH = os.getenv(
    "FIREBASE_SERVICE_ACCOUNT",
    os.path.join(os.path.dirname(__file__), "serviceAccountKey.json"),
)

_firebase_app = None


def init_firebase():
    """Initialize Firebase Admin SDK for auth token verification only."""
    global _firebase_app
    if _firebase_app is not None:
        return

    try:
        import firebase_admin
        from firebase_admin import credentials

        if os.path.exists(SERVICE_ACCOUNT_PATH):
            cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
            _firebase_app = firebase_admin.initialize_app(cred)
        else:
            _firebase_app = firebase_admin.initialize_app()
        print("  ✓ Firebase Auth initialized (token verification only)")
    except Exception as e:
        print(
            f"⚠  WARNING: Firebase Auth init failed: {e}\n"
            "   Phone OTP verification will not work without Firebase.\n"
            "   Place serviceAccountKey.json in backend/ to enable."
        )
        _firebase_app = None


# ──────────────────────────────────────────────
# JWT Auth (replaces Firebase phone auth)
# ──────────────────────────────────────────────
JWT_SECRET = os.getenv("JWT_SECRET", "prism-dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = 24 * 7  # 1 week


def create_access_token(phone: str) -> str:
    """Create a signed JWT for the given phone number."""
    uid = hashlib.sha256(phone.encode()).hexdigest()
    payload = {
        "uid": uid,
        "phone": phone,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_access_token(token: str) -> dict:
    """Verify a Prism JWT and return decoded claims."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError as e:
        raise ValueError(f"Invalid token: {e}")


# ──────────────────────────────────────────────
# Application Settings
# ──────────────────────────────────────────────
MODEL_PATH = os.getenv(
    "MODEL_PATH",
    os.path.join(os.path.dirname(__file__), "..", "production1_chat_model"),
)

# Sus-Buffer thresholds
SUS_LOWER = float(os.getenv("SUS_LOWER", "0.40"))
SUS_UPPER = float(os.getenv("SUS_UPPER", "0.79"))
THREAT_THRESHOLD = float(os.getenv("THREAT_THRESHOLD", "0.92"))

# ChromaDB vector similarity threshold
VECTOR_MATCH_THRESHOLD = float(os.getenv("VECTOR_MATCH_THRESHOLD", "0.95"))

# Sus-buffer config
SUS_BUFFER_MAX_MESSAGES = 5
SUS_BUFFER_EXPIRY_HOURS = 24

# Levenshtein impersonation threshold
IMPERSONATION_DISTANCE = 3

# URL scanner thresholds
MAX_URL_LENGTH = 100

# CORS
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
