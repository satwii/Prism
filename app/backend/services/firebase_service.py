"""
SQLite Database Service — all CRUD operations.
Zero setup, zero cost — just a file on disk.
"""
from config import get_db
from typing import Optional
import uuid
import json
import datetime


def _now():
    return datetime.datetime.utcnow().isoformat()


# ──────────────────────────────────────────────
# Users
# ──────────────────────────────────────────────
def create_user(uid: str, data: dict) -> dict:
    db = get_db()
    db.execute(
        """INSERT OR REPLACE INTO users
           (uid, displayName, phoneHash, gender, age,
            emergencyContactName, emergencyContactPhone, tripCount, isAdmin, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)""",
        (uid, data["displayName"], data["phoneHash"], data["gender"],
         data["age"], data["emergencyContactName"],
         data["emergencyContactPhone"], _now()),
    )
    db.commit()
    return {**data, "uid": uid, "tripCount": 0, "isAdmin": False}


def get_user(uid: str) -> Optional[dict]:
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE uid = ?", (uid,)).fetchone()
    if row:
        return dict(row)
    return None


def update_user(uid: str, updates: dict) -> bool:
    db = get_db()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [uid]
    db.execute(f"UPDATE users SET {set_clause} WHERE uid = ?", values)
    db.commit()
    return True


def lookup_user_by_phone_hash(phone_hash: str) -> Optional[dict]:
    db = get_db()
    row = db.execute(
        "SELECT uid, displayName FROM users WHERE phoneHash = ?", (phone_hash,)
    ).fetchone()
    if row:
        return {"uid": row["uid"], "displayName": row["displayName"]}
    return None


def increment_trip_count(uid: str):
    db = get_db()
    db.execute("UPDATE users SET tripCount = tripCount + 1 WHERE uid = ?", (uid,))
    db.commit()


# ──────────────────────────────────────────────
# Contacts
# ──────────────────────────────────────────────
def add_contact(user_id: str, contact_phone_hash: str):
    db = get_db()
    db.execute(
        "INSERT OR IGNORE INTO contacts (userId, contactPhoneHash, addedAt) VALUES (?, ?, ?)",
        (user_id, contact_phone_hash, _now()),
    )
    db.commit()


def is_known_contact(user_id: str, sender_phone_hash: str) -> bool:
    db = get_db()
    row = db.execute(
        "SELECT 1 FROM contacts WHERE userId = ? AND contactPhoneHash = ?",
        (user_id, sender_phone_hash),
    ).fetchone()
    return row is not None


def get_contacts(user_id: str) -> list:
    db = get_db()
    rows = db.execute("SELECT * FROM contacts WHERE userId = ?", (user_id,)).fetchall()
    return [dict(r) for r in rows]


# ──────────────────────────────────────────────
# Chat Permissions
# ──────────────────────────────────────────────
def get_chat_permission(user_id: str, partner_id: str) -> Optional[dict]:
    db = get_db()
    row = db.execute(
        "SELECT * FROM chat_permissions WHERE userId = ? AND chatPartnerId = ?",
        (user_id, partner_id),
    ).fetchone()
    if row:
        return dict(row)
    return None


def set_chat_permission(user_id: str, partner_id: str, ai_scan_granted: bool):
    db = get_db()
    db.execute(
        """INSERT OR REPLACE INTO chat_permissions
           (userId, chatPartnerId, aiScanGranted, updatedAt)
           VALUES (?, ?, ?, ?)""",
        (user_id, partner_id, 1 if ai_scan_granted else 0, _now()),
    )
    db.commit()


# ──────────────────────────────────────────────
# Messages
# ──────────────────────────────────────────────
def store_message(data: dict) -> str:
    db = get_db()
    msg_id = str(uuid.uuid4())
    db.execute(
        """INSERT INTO messages
           (id, chatId, senderId, ciphertext, plaintext, signature, sentAt,
            threatStatus, confidence, method)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (msg_id, data["chatId"], data["senderId"], data.get("ciphertext"),
         data.get("plaintext"), data.get("signature"), _now(),
         data.get("threatStatus"), data.get("confidence"), data.get("method")),
    )
    db.commit()
    return msg_id


def get_messages(chat_id: str, limit: int = 50) -> list:
    db = get_db()
    rows = db.execute(
        "SELECT * FROM messages WHERE chatId = ? ORDER BY sentAt ASC LIMIT ?",
        (chat_id, limit),
    ).fetchall()
    return [dict(r) for r in rows]


def get_chat_list(user_id: str) -> list:
    db = get_db()
    rows = db.execute(
        "SELECT * FROM chats WHERE participant1 = ? OR participant2 = ? ORDER BY lastMessageAt DESC",
        (user_id, user_id),
    ).fetchall()
    return [dict(r) for r in rows]


def create_chat(user_id: str, partner_id: str) -> str:
    db = get_db()
    # Check existing
    row = db.execute(
        """SELECT chatId FROM chats
           WHERE (participant1 = ? AND participant2 = ?)
              OR (participant1 = ? AND participant2 = ?)""",
        (user_id, partner_id, partner_id, user_id),
    ).fetchone()
    if row:
        return row["chatId"]

    chat_id = str(uuid.uuid4())
    db.execute(
        "INSERT INTO chats (chatId, participant1, participant2, createdAt) VALUES (?, ?, ?, ?)",
        (chat_id, user_id, partner_id, _now()),
    )
    db.commit()
    return chat_id


def update_chat_last_message(chat_id: str, message_preview: str):
    db = get_db()
    db.execute(
        "UPDATE chats SET lastMessage = ?, lastMessageAt = ? WHERE chatId = ?",
        (message_preview[:40], _now(), chat_id),
    )
    db.commit()


# ──────────────────────────────────────────────
# Sus Buffer
# ──────────────────────────────────────────────
def get_sus_buffer(chat_id: str) -> Optional[dict]:
    db = get_db()
    row = db.execute("SELECT * FROM sus_buffer WHERE chatId = ?", (chat_id,)).fetchone()
    if row:
        d = dict(row)
        d["messages"] = json.loads(d["messages"]) if d["messages"] else []
        return d
    return None


def update_sus_buffer(chat_id: str, messages: list):
    db = get_db()
    msgs_json = json.dumps(messages[-5:])
    db.execute(
        """INSERT OR REPLACE INTO sus_buffer (chatId, messages, lastUpdated, messageCount)
           VALUES (?, ?, ?, ?)""",
        (chat_id, msgs_json, _now(), len(messages[-5:])),
    )
    db.commit()


def clear_sus_buffer(chat_id: str):
    db = get_db()
    db.execute("DELETE FROM sus_buffer WHERE chatId = ?", (chat_id,))
    db.commit()


# ──────────────────────────────────────────────
# Scam Reports
# ──────────────────────────────────────────────
def create_scam_report(reported_by: str, message_content: str, chat_id: str) -> str:
    db = get_db()
    report_id = str(uuid.uuid4())
    db.execute(
        """INSERT INTO scam_reports (id, reportedBy, messageContent, chatId, reportedAt, status)
           VALUES (?, ?, ?, ?, ?, 'pending')""",
        (report_id, reported_by, message_content, chat_id, _now()),
    )
    db.commit()
    return report_id


def get_scam_reports(status_filter: Optional[str] = None) -> list:
    db = get_db()
    if status_filter and status_filter != "all":
        rows = db.execute(
            "SELECT * FROM scam_reports WHERE status = ? ORDER BY reportedAt DESC",
            (status_filter,),
        ).fetchall()
    else:
        rows = db.execute("SELECT * FROM scam_reports ORDER BY reportedAt DESC").fetchall()
    return [dict(r) for r in rows]


def update_scam_report(report_id: str, updates: dict):
    db = get_db()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [report_id]
    db.execute(f"UPDATE scam_reports SET {set_clause} WHERE id = ?", values)
    db.commit()


# ──────────────────────────────────────────────
# Organizations
# ──────────────────────────────────────────────
def create_organization(data: dict) -> str:
    db = get_db()
    org_id = str(uuid.uuid4())
    db.execute(
        """INSERT INTO organizations
           (uid, name, regNumber, website, logoUrl, adminContactPhone, verified, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?)""",
        (org_id, data["name"], data["regNumber"], data["website"],
         data.get("logoUrl"), data.get("adminContactPhone"), _now()),
    )
    db.commit()
    return org_id


def get_organizations(status_filter: Optional[str] = None) -> list:
    db = get_db()
    if status_filter == "pending":
        rows = db.execute("SELECT * FROM organizations WHERE verified = 0").fetchall()
    elif status_filter == "approved":
        rows = db.execute("SELECT * FROM organizations WHERE verified = 1").fetchall()
    else:
        rows = db.execute("SELECT * FROM organizations").fetchall()
    return [dict(r) for r in rows]


def get_organization(org_id: str) -> Optional[dict]:
    db = get_db()
    row = db.execute("SELECT * FROM organizations WHERE uid = ?", (org_id,)).fetchone()
    return dict(row) if row else None


def update_organization(org_id: str, updates: dict):
    db = get_db()
    set_clause = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [org_id]
    db.execute(f"UPDATE organizations SET {set_clause} WHERE uid = ?", values)
    db.commit()


def is_verified_org(sender_uid: str) -> bool:
    db = get_db()
    row = db.execute(
        "SELECT 1 FROM organizations WHERE uid = ? AND verified = 1", (sender_uid,)
    ).fetchone()
    return row is not None


def get_verified_org_names() -> list:
    db = get_db()
    rows = db.execute("SELECT name FROM organizations WHERE verified = 1").fetchall()
    return [r["name"] for r in rows]


# ──────────────────────────────────────────────
# Blocklist
# ──────────────────────────────────────────────
def get_blocklist() -> set:
    db = get_db()
    rows = db.execute("SELECT domain FROM blocklist").fetchall()
    return {r["domain"].lower() for r in rows}


def add_to_blocklist(domain: str, added_by: str) -> str:
    db = get_db()
    doc_id = str(uuid.uuid4())
    db.execute(
        "INSERT INTO blocklist (id, domain, addedBy, addedAt) VALUES (?, ?, ?, ?)",
        (doc_id, domain.lower(), added_by, _now()),
    )
    db.commit()
    return doc_id


def remove_from_blocklist(doc_id: str):
    db = get_db()
    db.execute("DELETE FROM blocklist WHERE id = ?", (doc_id,))
    db.commit()


# ──────────────────────────────────────────────
# Ratings
# ──────────────────────────────────────────────
def create_rating(rated_by: str, rated_user: str, session_id: str, stars: int, note: Optional[str]):
    db = get_db()
    rating_id = str(uuid.uuid4())
    db.execute(
        """INSERT INTO ratings (id, sessionId, ratedBy, ratedUser, stars, note, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (rating_id, session_id, rated_by, rated_user, stars, note, _now()),
    )
    db.commit()


def get_user_ratings(user_id: str) -> dict:
    db = get_db()
    rows = db.execute("SELECT stars FROM ratings WHERE ratedUser = ?", (user_id,)).fetchall()
    if not rows:
        return {"averageRating": 0.0, "totalRatings": 0}
    total = sum(r["stars"] for r in rows)
    return {"averageRating": round(total / len(rows), 1), "totalRatings": len(rows)}


# ──────────────────────────────────────────────
# Admin Logs — NEVER deletable
# ──────────────────────────────────────────────
def log_admin_action(admin_id: str, action: str, target_id: str):
    db = get_db()
    log_id = str(uuid.uuid4())
    db.execute(
        "INSERT INTO admin_logs (id, adminId, action, targetId, timestamp) VALUES (?, ?, ?, ?, ?)",
        (log_id, admin_id, action, target_id, _now()),
    )
    db.commit()


# ──────────────────────────────────────────────
# DH Session Keys
# ──────────────────────────────────────────────
def store_dh_public_key(chat_id: str, user_id: str, public_key: int):
    db = get_db()
    db.execute(
        """INSERT OR REPLACE INTO dh_keys (chatId, userId, publicKey, createdAt)
           VALUES (?, ?, ?, ?)""",
        (chat_id, user_id, public_key, _now()),
    )
    db.commit()


def get_dh_public_key(chat_id: str, user_id: str) -> Optional[int]:
    db = get_db()
    row = db.execute(
        "SELECT publicKey FROM dh_keys WHERE chatId = ? AND userId = ?",
        (chat_id, user_id),
    ).fetchone()
    return row["publicKey"] if row else None


# ──────────────────────────────────────────────
# RSA Public Keys
# ──────────────────────────────────────────────
def store_rsa_public_key(uid: str, public_key_pem: str):
    db = get_db()
    db.execute(
        "INSERT OR REPLACE INTO rsa_keys (uid, publicKeyPem, createdAt) VALUES (?, ?, ?)",
        (uid, public_key_pem, _now()),
    )
    db.commit()


def get_rsa_public_key(uid: str) -> Optional[str]:
    db = get_db()
    row = db.execute("SELECT publicKeyPem FROM rsa_keys WHERE uid = ?", (uid,)).fetchone()
    return row["publicKeyPem"] if row else None


# ──────────────────────────────────────────────
# Vector metadata
# ──────────────────────────────────────────────
def store_vector_metadata(report_id: str, original_text: str, added_by: str, chroma_id: str):
    db = get_db()
    db.execute(
        """INSERT INTO vector_metadata (id, originalText, addedBy, addedAt, chromaId)
           VALUES (?, ?, ?, ?, ?)""",
        (report_id, original_text, added_by, _now(), chroma_id),
    )
    db.commit()
