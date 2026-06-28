"""
Prism API comprehensive test. Clean output, no ANSI/emoji.
"""
import requests
import hashlib
import sys
import os
import sqlite3
import random

BASE = "http://localhost:8000"

pass_count = 0
fail_count = 0
issues = []

def ok(name):
    global pass_count
    pass_count += 1
    print(f"  PASS: {name}")

def fail(name, detail=""):
    global fail_count
    fail_count += 1
    issues.append(f"{name}: {detail}")
    print(f"  FAIL: {name} -- {detail}")

def section(title):
    print(f"\n{'='*60}\n  {title}\n{'='*60}")

def phone_hash(phone):
    return hashlib.sha256(phone.encode()).hexdigest()

# ======================================================
# USER A -- Alice
# ======================================================
section("OTP FLOW -- USER A (Alice)")

PHONE_A = "+910000000201"
PHONE_B = "+910000000202"

r = requests.post(f"{BASE}/api/auth/send-otp", json={"phone": PHONE_A})
if r.status_code == 200:
    ok("Send OTP for Alice")
else:
    fail("Send OTP Alice", f"{r.status_code} {r.text[:200]}")
    sys.exit(1)

r2 = requests.get(f"{BASE}/api/auth/debug-otp", params={"phone": PHONE_A})
if r2.status_code == 200:
    OTP_A = r2.json()["otp"]
    ok(f"Got OTP A: {OTP_A}")
else:
    fail("Get OTP A", f"{r2.status_code} {r2.text[:200]}")
    sys.exit(1)

r = requests.post(f"{BASE}/api/auth/verify-otp", json={"phone": PHONE_A, "otp": OTP_A})
if r.status_code == 200 and "token" in r.json():
    TOKEN_A = r.json()["token"]
    UID_A   = r.json()["uid"]
    ok(f"Verify OTP A -- uid={UID_A[:10]}...")
else:
    fail("Verify OTP A", f"{r.status_code} {r.text[:200]}")
    sys.exit(1)

headers_a = {"Authorization": f"Bearer {TOKEN_A}"}

# Register Alice
section("REGISTER -- Alice")
reg_a = {
    "displayName": "Alice Test",
    "phoneHash": phone_hash(PHONE_A),
    "gender": "female",
    "age": 25,
    "emergencyContactName": "Emergency Alice",
    "emergencyContactPhone": "+910000099201",
}
r = requests.post(f"{BASE}/api/auth/register", json=reg_a, headers=headers_a)
if r.status_code in (200, 409):
    ok(f"Register Alice -- {r.status_code}")
else:
    fail("Register Alice", f"{r.status_code} {r.text[:300]}")

# ======================================================
# USER B -- Bob
# ======================================================
section("OTP + REGISTER -- USER B (Bob)")

r = requests.post(f"{BASE}/api/auth/send-otp", json={"phone": PHONE_B})
if r.status_code == 200:
    ok("Send OTP Bob")
else:
    fail("Send OTP Bob", f"{r.status_code}")

r2 = requests.get(f"{BASE}/api/auth/debug-otp", params={"phone": PHONE_B})
if r2.status_code == 200:
    OTP_B = r2.json()["otp"]
    ok(f"Got OTP B: {OTP_B}")
else:
    fail("Get OTP B", f"{r2.status_code} {r2.text[:200]}")
    sys.exit(1)

r = requests.post(f"{BASE}/api/auth/verify-otp", json={"phone": PHONE_B, "otp": OTP_B})
if r.status_code == 200:
    TOKEN_B = r.json()["token"]
    UID_B   = r.json()["uid"]
    ok(f"Verify OTP B -- uid={UID_B[:10]}...")
else:
    fail("Verify OTP B", f"{r.status_code} {r.text[:200]}")
    sys.exit(1)

headers_b = {"Authorization": f"Bearer {TOKEN_B}"}

reg_b = {
    "displayName": "Bob Victim",
    "phoneHash": phone_hash(PHONE_B),
    "gender": "male",
    "age": 30,
    "emergencyContactName": "Emergency Bob",
    "emergencyContactPhone": "+910000099202",
}
r = requests.post(f"{BASE}/api/auth/register", json=reg_b, headers=headers_b)
if r.status_code in (200, 409):
    ok(f"Register Bob -- {r.status_code}")
else:
    fail("Register Bob", f"{r.status_code} {r.text[:300]}")

# ======================================================
# PROFILE ENDPOINTS
# ======================================================
section("PROFILE ENDPOINTS")

r = requests.get(f"{BASE}/api/auth/me", headers=headers_a)
if r.status_code == 200:
    ok(f"GET /me -- name={r.json().get('displayName')}")
else:
    fail("/me", f"{r.status_code} {r.text[:200]}")

# NEW: GET /api/auth/user/{uid} endpoint
r = requests.get(f"{BASE}/api/auth/user/{UID_B}", headers=headers_a)
if r.status_code == 200 and "phoneHash" in r.json():
    h = r.json()["phoneHash"]
    match = (h == phone_hash(PHONE_B))
    ok(f"GET /user/uid -- phoneHash match={match}")
    if not match:
        fail("phoneHash mismatch", f"got {h[:16]}")
else:
    fail("GET /user/{uid}", f"{r.status_code} {r.text[:200]}")

# ======================================================
# CHAT CREATION + DH KEY EXCHANGE
# ======================================================
section("CHAT CREATION + DH")

r = requests.post(f"{BASE}/api/chat/new",
                  json={"contactPhoneHash": phone_hash(PHONE_B)},
                  headers=headers_a)
if r.status_code == 200:
    CHAT_ID = r.json()["chatId"]
    ok(f"Create chat -- {CHAT_ID[:12]}...")
else:
    fail("Create chat", f"{r.status_code} {r.text[:300]}")
    sys.exit(1)

DH_P, DH_G = 23, 5
priv_a = random.randint(1, DH_P - 2)
pub_a  = pow(DH_G, priv_a, DH_P)
r = requests.post(f"{BASE}/api/chat/dh-exchange",
                  json={"chatId": CHAT_ID, "publicKey": pub_a},
                  headers=headers_a)
if r.status_code == 200:
    ok(f"DH exchange -- server_pub={r.json().get('publicKey')}")
else:
    fail("DH exchange", f"{r.status_code} {r.text[:200]}")

# ======================================================
# ADD CONTACT (new feature)
# ======================================================
section("ADD CONTACT (New Feature)")

r = requests.post(f"{BASE}/api/auth/contacts/add",
                  json={"phoneHash": phone_hash(PHONE_B)},
                  headers=headers_a)
if r.status_code == 200:
    ok("Alice adds Bob as contact")
else:
    fail("Add contact", f"{r.status_code} {r.text[:200]}")

# ======================================================
# SEND MESSAGES + THREAT DETECTION
# ======================================================
section("SEND MESSAGES + THREAT DETECTION")

def send_msg(text, hdrs, chat_id):
    return requests.post(f"{BASE}/api/chat/send",
                         json={"chatId": chat_id, "ciphertext": text, "signature": ""},
                         headers=hdrs)

# Safe message
r = send_msg("Hello Bob! How are you doing today?", headers_a, CHAT_ID)
if r.status_code == 200:
    a = r.json().get("analysis", {})
    s = a.get("status")
    ok(f"SAFE msg -- status={s} conf={a.get('confidence', 0):.2f}")
else:
    fail("Send safe msg", f"{r.status_code} {r.text[:200]}")

# Phishing message (URL)
phish = "URGENT: Click http://paypa1-secure.ru/verify?token=abc to reset password NOW or lose access forever!"
r = send_msg(phish, headers_a, CHAT_ID)
if r.status_code == 200:
    a = r.json().get("analysis", {})
    s = a.get("status")
    ok(f"PHISHING msg -- status={s} conf={a.get('confidence', 0):.2f}")
    if s in ("PHISHING", "BLOCKED_URL", "BLOCKED_VECTOR", "SUSPICIOUS"):
        ok(f"Threat detected correctly: {s}")
    else:
        fail("Phishing not detected", f"got={s}")
else:
    fail("Send phishing msg", f"{r.status_code} {r.text[:200]}")

# Social engineering
se = "Hi, I am from your bank fraud dept. Your account is compromised. Share your OTP and card PIN now."
r = send_msg(se, headers_a, CHAT_ID)
if r.status_code == 200:
    a = r.json().get("analysis", {})
    s = a.get("status")
    ok(f"SOCIAL_ENG msg -- status={s} conf={a.get('confidence', 0):.2f}")
else:
    fail("Send SE msg", f"{r.status_code} {r.text[:200]}")

# Grooming
groom = "Hey, keep this between us -- don't tell your parents. Can you send me a private photo?"
r = send_msg(groom, headers_a, CHAT_ID)
if r.status_code == 200:
    a = r.json().get("analysis", {})
    s = a.get("status")
    ok(f"GROOMING msg -- status={s} conf={a.get('confidence', 0):.2f}")
else:
    fail("Send grooming msg", f"{r.status_code} {r.text[:200]}")


# ======================================================
# GET MESSAGES (Bob = receiver sees threat statuses)
# Verify: sender analysis stored in DB but only receiver sees it in UI
# ======================================================
section("GET MESSAGES -- Receiver (Bob) sees threat statuses")

r = requests.get(f"{BASE}/api/chat/messages/{CHAT_ID}", headers=headers_b)
if r.status_code == 200:
    msgs = r.json().get("messages", [])
    ok(f"Bob gets {len(msgs)} messages")
    for m in msgs:
        text        = (m.get("plaintext") or "")[:40]
        ts          = m.get("threatStatus", "--")
        conf        = m.get("confidence") or 0
        sender_short = m.get("senderId", "?")[:8]
        print(f"    [{sender_short}] {text!r:40s} => {ts} ({conf:.2f})")
else:
    fail("Get messages (Bob)", f"{r.status_code} {r.text[:200]}")

# ======================================================
# REPORT MESSAGES (receiver can report any including SAFE)
# ======================================================
section("REPORT MESSAGES (receiver can report SAFE messages)")

r = requests.post(f"{BASE}/api/reports/",
                  json={"messageContent": "Hello Bob! How are you doing today?", "chatId": CHAT_ID},
                  headers=headers_b)
if r.status_code == 200:
    ok("Bob reports SAFE message -- success (any msg can be reported)")
else:
    fail("Report SAFE msg", f"{r.status_code} {r.text[:200]}")

r = requests.post(f"{BASE}/api/reports/",
                  json={"messageContent": phish, "chatId": CHAT_ID},
                  headers=headers_b)
if r.status_code == 200:
    ok("Bob reports PHISHING message -- success")
else:
    fail("Report phishing msg", f"{r.status_code} {r.text[:200]}")

r = requests.get(f"{BASE}/api/reports/my-reports", headers=headers_b)
if r.status_code == 200:
    s = r.json().get("summary", {})
    ok(f"Bob's reports: total={s.get('total')} pending={s.get('pending')}")
else:
    fail("My reports", f"{r.status_code} {r.text[:200]}")

# ======================================================
# CHAT PERMISSIONS
# ======================================================
section("CHAT PERMISSIONS (Consent)")

r = requests.get(f"{BASE}/api/chat/permission/{UID_A}", headers=headers_b)
if r.status_code == 200:
    ok(f"GET permission -- {r.json()}")
else:
    fail("GET permission", f"{r.status_code} {r.text[:200]}")

r = requests.post(f"{BASE}/api/chat/permission",
                  json={"chatPartnerId": UID_A, "aiScanGranted": True},
                  headers=headers_b)
if r.status_code == 200:
    ok("SET aiScanGranted=True")
else:
    fail("SET permission", f"{r.status_code} {r.text[:200]}")

# ======================================================
# STANDALONE ANALYZE
# ======================================================
section("STANDALONE ANALYZE ENDPOINT")

test_msgs = [
    "Hi how are you today?",
    "Click here to claim your prize http://scam-win-prize.ru",
    "I am from Microsoft support, give me your password and OTP",
]
for txt in test_msgs:
    r = requests.post(f"{BASE}/api/chat/analyze",
                      json={"message": txt, "chat_id": CHAT_ID, "sender_id": UID_A},
                      headers=headers_b)
    if r.status_code == 200:
        a = r.json()
        ok(f"  '{txt[:40]}' => {a.get('status')} ({a.get('confidence', 0):.2f})")
    else:
        fail(f"Analyze", f"{r.status_code} {r.text[:200]}")

# ======================================================
# ADMIN ENDPOINTS
# ======================================================
section("ADMIN ENDPOINTS")

db_path = os.path.join(os.path.dirname(__file__), "backend", "prism.db")
conn = sqlite3.connect(db_path)
conn.execute(f"UPDATE users SET isAdmin=1 WHERE uid='{UID_A}'")
conn.commit()
conn.close()
ok("Set Alice as admin in DB")

r = requests.get(f"{BASE}/api/admin/reports", headers=headers_a)
if r.status_code == 200:
    reports = r.json().get("reports", [])
    ok(f"Admin reports -- {len(reports)} reports")
elif r.status_code == 403:
    fail("Admin reports 403", "isAdmin not being re-read from DB")
else:
    fail("Admin reports", f"{r.status_code} {r.text[:200]}")

r = requests.get(f"{BASE}/api/admin/blocklist", headers=headers_a)
if r.status_code == 200:
    ok(f"Admin blocklist -- {len(r.json().get('items', []))} items")
elif r.status_code == 403:
    fail("Admin blocklist 403", "access denied")
else:
    fail("Admin blocklist", f"{r.status_code} {r.text[:200]}")

r = requests.get(f"{BASE}/api/admin/vector-stats", headers=headers_a)
if r.status_code == 200:
    ok(f"Admin vector-stats -- {r.json()}")
elif r.status_code == 403:
    fail("Admin vector-stats 403", "access denied")
else:
    fail("vector-stats", f"{r.status_code}")

r = requests.get(f"{BASE}/api/admin/logs", headers=headers_a)
if r.status_code == 200:
    ok(f"Admin logs -- {len(r.json().get('logs', []))} entries")
else:
    fail("Admin logs", f"{r.status_code} {r.text[:200]}")

# ======================================================
# SUMMARY
# ======================================================
section("TEST SUMMARY")
print(f"\n  PASSED: {pass_count}")
print(f"  FAILED: {fail_count}")
if issues:
    print(f"\n  Issues found:")
    for i, iss in enumerate(issues, 1):
        print(f"  {i}. {iss}")
else:
    print("\n  All tests passed!")
