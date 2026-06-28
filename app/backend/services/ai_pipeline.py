"""
AI Analysis Pipeline — 8-step message processing engine.

Every incoming message passes through these steps in order:
1. DH Key Exchange (handled at session start, not per-message)
2. AES-128 Fernet Decryption
3. RSA Digital Signature Verification
4. URL Blocklist + Regex Scanner
5. Consent & Organization Bypass Check
6. Sus Buffer Multi-Turn Context
7. ChromaDB Vector Similarity Check
8. DistilBERT Inference

Implemented in services/ai_pipeline.py as specified.
"""
import re
import time
import torch
import datetime
from typing import Optional
from urllib.parse import urlparse, unquote

from config import (
    SUS_LOWER, SUS_UPPER, THREAT_THRESHOLD,
    VECTOR_MATCH_THRESHOLD, MAX_URL_LENGTH,
    IMPERSONATION_DISTANCE, SUS_BUFFER_MAX_MESSAGES,
    SUS_BUFFER_EXPIRY_HOURS,
)
from services.encryption import fernet_decrypt, rsa_verify
from services.chromadb_service import check_vector_db
from services import firebase_service as fb

# Lazy import to avoid circular — set at startup
_tokenizer = None
_model = None

# In-memory Sus Buffer (also persisted to Firestore)
_sus_buffers: dict[str, dict] = {}

# Brand names for lookalike domain detection
KNOWN_BRANDS = [
    "google", "facebook", "apple", "amazon", "microsoft", "paypal",
    "netflix", "instagram", "twitter", "whatsapp", "telegram",
    "icici", "hdfc", "sbi", "axis", "paytm", "phonepe", "gpay",
    "flipkart", "myntra", "swiggy", "zomato",
]

# URL regex pattern
URL_REGEX = re.compile(
    r'https?://[^\s<>"{}|\\^`\[\]]+|'
    r'www\.[^\s<>"{}|\\^`\[\]]+',
    re.IGNORECASE,
)


def init_pipeline(tokenizer, model):
    """Set the tokenizer and model references. Called at startup."""
    global _tokenizer, _model
    _tokenizer = tokenizer
    _model = model
    print("✓ AI Pipeline initialized")


# ──────────────────────────────────────────────
# Step 4 — URL Blocklist + Regex Scanner
# ──────────────────────────────────────────────
def _levenshtein_distance(s1: str, s2: str) -> int:
    """Compute Levenshtein edit distance between two strings."""
    if len(s1) < len(s2):
        return _levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)

    prev_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        curr_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = prev_row[j + 1] + 1
            deletions = curr_row[j] + 1
            substitutions = prev_row[j] + (c1 != c2)
            curr_row.append(min(insertions, deletions, substitutions))
        prev_row = curr_row
    return prev_row[-1]


def _scan_urls(text: str, blocklist: set[str]) -> dict:
    """
    Extract URLs and check against:
    - Admin-maintained blocklist (O(1) hash lookup)
    - Lookalike domains (Levenshtein distance < 3)
    - IP-based URLs
    - URLs longer than 100 chars
    - URL-encoded obfuscation
    """
    urls = URL_REGEX.findall(text)
    if not urls:
        return {"blocked": False}

    for url in urls:
        # Check URL length
        if len(url) > MAX_URL_LENGTH:
            return {"blocked": True, "reason": f"Suspicious long URL: {url[:60]}..."}

        # Check URL-encoded obfuscation
        decoded = unquote(url)
        if decoded != url and any(c in decoded for c in ['<', '>', 'javascript:', 'data:']):
            return {"blocked": True, "reason": f"URL-encoded obfuscation detected"}

        # Parse domain
        try:
            parsed = urlparse(url if url.startswith("http") else f"http://{url}")
            domain = parsed.hostname or ""
        except Exception:
            continue

        # Check blocklist (O(1))
        if domain.lower() in blocklist:
            return {"blocked": True, "reason": f"Blocked domain: {domain}"}

        # Check IP-based URL
        ip_pattern = re.compile(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$')
        if ip_pattern.match(domain):
            return {"blocked": True, "reason": f"IP-based URL detected: {domain}"}

        # Check lookalike domains (Levenshtein < 3)
        domain_parts = domain.replace("www.", "").split(".")[0]
        for brand in KNOWN_BRANDS:
            dist = _levenshtein_distance(domain_parts.lower(), brand)
            if 0 < dist < IMPERSONATION_DISTANCE:
                return {
                    "blocked": True,
                    "reason": f"Lookalike domain '{domain}' similar to '{brand}'",
                }

    return {"blocked": False}


# ──────────────────────────────────────────────
# Step 6 — Sus Buffer
# ──────────────────────────────────────────────
def _get_sus_buffer(chat_id: str) -> list[str]:
    """Get current sus buffer for a chat (memory + Firestore fallback)."""
    if chat_id in _sus_buffers:
        buf = _sus_buffers[chat_id]
        # Check 24-hour expiry
        last_updated = buf.get("lastUpdated", 0)
        if time.time() - last_updated > SUS_BUFFER_EXPIRY_HOURS * 3600:
            _clear_sus_buffer(chat_id)
            return []
        return buf.get("messages", [])

    # Fallback to Firestore
    fb_buf = fb.get_sus_buffer(chat_id)
    if fb_buf and fb_buf.get("messages"):
        _sus_buffers[chat_id] = {
            "messages": fb_buf["messages"],
            "lastUpdated": time.time(),
        }
        return fb_buf["messages"]
    return []


def _append_sus_buffer(chat_id: str, text: str):
    """Append a message to the sus buffer (FIFO, max 5)."""
    messages = _get_sus_buffer(chat_id)
    messages.append(text)
    messages = messages[-SUS_BUFFER_MAX_MESSAGES:]  # FIFO
    _sus_buffers[chat_id] = {
        "messages": messages,
        "lastUpdated": time.time(),
    }
    fb.update_sus_buffer(chat_id, messages)


def _clear_sus_buffer(chat_id: str):
    """Clear the sus buffer for a chat."""
    _sus_buffers.pop(chat_id, None)
    fb.clear_sus_buffer(chat_id)


# ──────────────────────────────────────────────
# Step 8 — BERT Inference
# ──────────────────────────────────────────────
# Label index → class name mapping (matches training in distillScratch.py)
# label_dict = {'safe': 0, 'authority': 1, 'urgency_scarcity': 2, 'persuasion': 3, 'predatory_grooming': 4}
_LABEL_NAMES = ['SAFE', 'AUTHORITY', 'URGENCY_SCARCITY', 'PERSUASION', 'PREDATORY_GROOMING']

# ──────────────────────────────────────────────
# Pre-filter: common casual phrases the model reliably misclassifies
# These bypass BERT entirely and return SAFE immediately.
# ──────────────────────────────────────────────
_CASUAL_PATTERNS = re.compile(
    r'^\s*('
    r'hi+|hello+|hey+|hiya|sup|what\'?s up|howdy|greetings|'
    r'how are you|how r u|how are u|hru|how\'?s it going|how\'?s everything|'
    r'good morning|good afternoon|good evening|good night|gm|gn|'
    r'ok|okay|k|kk|sure|alright|sounds good|sounds great|cool|'
    r'yes|no|yeah|yep|nope|nah|maybe|of course|definitely|absolutely|'
    r'thanks|thank you|thank u|ty|thx|yw|you\'?re welcome|np|no problem|'
    r'bye|goodbye|see you|see ya|later|cya|talk later|ttyl|'
    r'lol|lmao|haha|hehe|😂|😊|👍|❤️|'
    r'me too|same here|same|agreed|exactly|'
    r'shall we catch up|catch up|let\'?s catch up|wanna catch up|'
    r'how\'?s life|what\'?s new|long time no see|miss you|missed you'
    r')\s*[!?.]*\s*$',
    re.IGNORECASE,
)


def _run_inference(text: str) -> dict:
    """
    Run BERT inference. Returns the predicted class label, its confidence,
    and the SAFE class probability for secondary validation.
    Model labels: SAFE=0, AUTHORITY=1, URGENCY_SCARCITY=2, PERSUASION=3, PREDATORY_GROOMING=4
    """
    inputs = _tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=512,
        padding=True,
    )
    with torch.no_grad():
        outputs = _model(**inputs)

    logits = outputs.logits
    probs = torch.softmax(logits, dim=-1).squeeze()
    probs_list = probs.tolist()

    # Predicted class = argmax of softmax probabilities
    predicted_idx = int(torch.argmax(probs).item())
    confidence = round(probs_list[predicted_idx], 4)
    safe_prob = round(probs_list[0], 4)  # Index 0 = SAFE
    label = _LABEL_NAMES[predicted_idx] if predicted_idx < len(_LABEL_NAMES) else 'SAFE'

    # Debug log — helps tune thresholds
    print(f"[BERT] text={repr(text[:60])} | pred={label} conf={confidence:.3f} safe_prob={safe_prob:.3f}")
    for i, (name, p) in enumerate(zip(_LABEL_NAMES, probs_list)):
        print(f"  [{i}] {name}: {p:.4f}")

    return {"class": label, "confidence": confidence, "safe_prob": safe_prob}


# ──────────────────────────────────────────────
# Impersonation Detection
# ──────────────────────────────────────────────
def check_impersonation(sender_name: str) -> Optional[str]:
    """
    Check if sender name is suspiciously similar to a verified org name.
    Returns the matched org name if impersonation is detected, else None.
    """
    try:
        org_names = fb.get_verified_org_names()
    except Exception:
        return None

    for org_name in org_names:
        dist = _levenshtein_distance(sender_name.lower(), org_name.lower())
        if 0 < dist < IMPERSONATION_DISTANCE:
            return org_name
    return None


# ──────────────────────────────────────────────
# MAIN PIPELINE
# ──────────────────────────────────────────────
def analyze_message(
    message: str,
    chat_id: str,
    sender_id: str,
    receiver_id: str,
    session_key: Optional[bytes] = None,
    is_encrypted: bool = False,
) -> dict:
    """
    Run the full 8-step analysis pipeline on an incoming message.

    Returns:
    {
        "status": "SAFE"|"SUSPICIOUS"|"THREAT"|"BLOCKED_VECTOR"|"BLOCKED_URL"|"INTEGRITY_FAIL",
        "confidence": float,
        "method": "distilbert"|"chromadb"|"blocklist"|"bypass",
        "matched_pattern": str|None,
        "buffer_active": bool
    }
    """
    plaintext = message

    # ── Step 2: AES Fernet Decryption ──
    if is_encrypted and session_key:
        try:
            plaintext = fernet_decrypt(message, session_key)
        except Exception:
            return {
                "status": "INTEGRITY_FAIL",
                "confidence": 1.0,
                "method": "blocklist",
                "matched_pattern": "Decryption failed — message may be tampered",
                "buffer_active": False,
            }

    # ── Step 3: RSA Signature Verification ──
    # (Handled at the route level where signature is available)
    # If signature check fails at route level, we never reach here.

    # ── Step 4: URL Blocklist + Regex Scanner ──
    try:
        blocklist = fb.get_blocklist()
    except Exception:
        blocklist = set()

    url_result = _scan_urls(plaintext, blocklist)
    if url_result["blocked"]:
        return {
            "status": "BLOCKED_URL",
            "confidence": 1.0,
            "method": "blocklist",
            "matched_pattern": url_result.get("reason"),
            "buffer_active": False,
        }

    # ── Step 5: Consent & Organization Bypass ──
    # Check if sender is a verified organization
    try:
        if fb.is_verified_org(sender_id):
            return {
                "status": "SAFE",
                "confidence": 0.0,
                "method": "bypass",
                "matched_pattern": "Verified organization — bypass",
                "buffer_active": False,
            }
    except Exception:
        pass

    # Check consent
    try:
        permission = fb.get_chat_permission(receiver_id, sender_id)
        if permission and not permission.get("aiScanGranted", True):
            # Private chat — scanning off
            return {
                "status": "SAFE",
                "confidence": 0.0,
                "method": "bypass",
                "matched_pattern": "Private chat — scanning disabled by user",
                "buffer_active": False,
            }
    except Exception:
        pass

    # ── Step 6: Sus Buffer Multi-Turn Context ──
    buffered_messages = _get_sus_buffer(chat_id)
    analysis_text = plaintext
    buffer_active = len(buffered_messages) > 0

    if buffered_messages:
        # Concatenate buffer + new message for context-aware prediction
        analysis_text = " ".join(buffered_messages) + " " + plaintext

    # ── Step 7: ChromaDB Vector Similarity ──
    try:
        vector_result = check_vector_db(plaintext, VECTOR_MATCH_THRESHOLD)
        if vector_result["match"]:
            _clear_sus_buffer(chat_id)
            return {
                "status": "BLOCKED_VECTOR",
                "confidence": vector_result["similarity"],
                "method": "chromadb",
                "matched_pattern": vector_result["pattern"],
                "buffer_active": False,
            }
    except Exception:
        pass

    # ── Pre-filter: Casual/Short messages bypass the model ──
    word_count = len(plaintext.strip().split())
    if word_count <= 3 or _CASUAL_PATTERNS.match(plaintext.strip()):
        print(f"[PIPELINE] Pre-filter: casual/short message — skipping BERT → SAFE")
        _clear_sus_buffer(chat_id)
        return {
            "status": "SAFE",
            "confidence": 1.0,
            "method": "pre_filter",
            "matched_pattern": None,
            "buffer_active": False,
        }

    # ── Step 8: DistilBERT Inference ──
    inference = _run_inference(analysis_text)
    predicted_class = inference["class"]
    confidence = inference["confidence"]
    safe_prob = inference.get("safe_prob", 0.0)

    THREAT_CLASSES = {"AUTHORITY", "URGENCY_SCARCITY", "PERSUASION", "PREDATORY_GROOMING"}

    if predicted_class in THREAT_CLASSES:
        # Secondary check: if the SAFE class probability is still competitive
        # (model is not really sure), don't hard-flag it
        model_is_uncertain = safe_prob >= 0.20

        if confidence >= THREAT_THRESHOLD and not model_is_uncertain:
            # High-confidence threat AND model is clearly NOT predicting safe
            _clear_sus_buffer(chat_id)
            return {
                "status": predicted_class,
                "confidence": confidence,
                "method": "distilbert",
                "matched_pattern": None,
                "buffer_active": False,
            }
        elif confidence >= SUS_LOWER:
            # Mid-range OR uncertain — mark as SUSPICIOUS, add to sus-buffer
            _append_sus_buffer(chat_id, plaintext)
            return {
                "status": "SUSPICIOUS",
                "confidence": confidence,
                "method": "distilbert",
                "matched_pattern": f"Possible {predicted_class.replace('_', ' ').title()} (needs more context)",
                "buffer_active": True,
            }
        else:
            # Low confidence — treat as SAFE
            _clear_sus_buffer(chat_id)
            return {
                "status": "SAFE",
                "confidence": confidence,
                "method": "distilbert",
                "matched_pattern": None,
                "buffer_active": False,
            }
    else:
        # Model predicted SAFE — clear buffer
        _clear_sus_buffer(chat_id)
        return {
            "status": "SAFE",
            "confidence": confidence,
            "method": "distilbert",
            "matched_pattern": None,
            "buffer_active": False,
        }
