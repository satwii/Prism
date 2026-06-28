"""
Chat Routes — Chat creation, messaging, DH key exchange, consent, analysis.
"""
from fastapi import APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect
from middleware.auth_middleware import get_current_user
from models.schemas import (
    NewChatRequest, SendMessageRequest, AnalyzeRequest, AnalyzeResponse,
    ChatPermissionUpdate, DHPublicKeyRequest, DHPublicKeyResponse,
)
from services import firebase_service as fb
from services.encryption import (
    dh_generate_keypair, dh_compute_shared_secret, dh_derive_fernet_key,
    fernet_encrypt, fernet_decrypt, rsa_verify,
)
from services.ai_pipeline import analyze_message, check_impersonation
from config import verify_access_token
import json

router = APIRouter(prefix="/api/chat", tags=["chat"])

# In-memory session keys (per chat)
_session_keys: dict[str, bytes] = {}

# Connected WebSocket clients: {user_id: WebSocket}
_ws_connections: dict[str, WebSocket] = {}


@router.post("/new")
async def create_new_chat(
    data: NewChatRequest,
    user: dict = Depends(get_current_user),
):
    """
    Create a new chat with a contact found by phone hash.
    Phone hash is looked up server-side — phone number never leaves any API.
    """
    uid = user["uid"]
    partner = fb.lookup_user_by_phone_hash(data.contactPhoneHash)
    if not partner:
        raise HTTPException(status_code=404, detail="User not found")

    chat_id = fb.create_chat(uid, partner["uid"])

    # Check if this is a known contact
    sender_data = fb.get_user(uid)
    is_known = fb.is_known_contact(uid, data.contactPhoneHash)

    # Check for org impersonation
    impersonating = check_impersonation(partner.get("displayName", ""))

    return {
        "chatId": chat_id,
        "partner": {
            "uid": partner["uid"],
            "displayName": partner["displayName"],
        },
        "isKnownContact": is_known,
        "impersonationWarning": impersonating,
    }


@router.get("/list")
async def get_chat_list(user: dict = Depends(get_current_user)):
    """Get all chats for the current user."""
    uid = user["uid"]
    chats = fb.get_chat_list(uid)

    enriched = []
    for chat in chats:
        partner_id = (
            chat["participant2"]
            if chat["participant1"] == uid
            else chat["participant1"]
        )
        partner = fb.get_user(partner_id)

        # Check if partner is a known contact
        partner_phone_hash = partner.get("phoneHash", "") if partner else ""
        is_known = fb.is_known_contact(uid, partner_phone_hash) if partner_phone_hash else False

        # Check if partner is a verified org
        is_verified_org = fb.is_verified_org(partner_id)

        enriched.append({
            "chatId": chat["chatId"],
            "partnerId": partner_id,
            "partnerName": partner["displayName"] if partner else "Unknown",
            "lastMessage": chat.get("lastMessage", ""),
            "lastMessageAt": str(chat.get("lastMessageAt", "")),
            "isKnownContact": is_known,
            "isVerifiedOrg": is_verified_org,
        })

    return {"chats": enriched}


@router.get("/messages/{chat_id}")
async def get_messages(
    chat_id: str,
    user: dict = Depends(get_current_user),
):
    """Get messages for a specific chat."""
    messages = fb.get_messages(chat_id)

    result = []
    for msg in messages:
        # Use stored plaintext from DB (populated by the send route).
        # Fall back to ciphertext if plaintext is missing (old messages).
        stored_plain = msg.get("plaintext") or msg.get("ciphertext", "")

        result.append({
            "id": msg.get("id"),
            "chatId": msg.get("chatId"),
            "senderId": msg.get("senderId"),
            "ciphertext": msg.get("ciphertext"),
            "plaintext": stored_plain,
            "sentAt": str(msg.get("sentAt", "")),
            "threatStatus": msg.get("threatStatus"),
            "confidence": msg.get("confidence"),
            "method": msg.get("method"),
        })

    return {"messages": result}


@router.post("/send")
async def send_message(
    data: SendMessageRequest,
    user: dict = Depends(get_current_user),
):
    """
    Send a message. The message is encrypted client-side.
    Server decrypts, runs analysis pipeline, stores, and forwards.
    """
    uid = user["uid"]
    session_key = _session_keys.get(data.chatId)

    # Decrypt the message for analysis
    plaintext = data.ciphertext
    if session_key:
        try:
            plaintext = fernet_decrypt(data.ciphertext, session_key)
        except Exception:
            pass

    # RSA signature verification (Step 3)
    if data.signature:
        public_key_pem = fb.get_rsa_public_key(uid)
        if public_key_pem:
            is_valid = rsa_verify(
                plaintext,
                data.signature,
                public_key_pem.encode("utf-8"),
            )
            if not is_valid:
                return {
                    "status": "INTEGRITY_FAIL",
                    "message": "Digital signature verification failed",
                }

    # Get the chat to find receiver
    chats = fb.get_chat_list(uid)
    receiver_id = None
    for chat in chats:
        if chat["chatId"] == data.chatId:
            receiver_id = (
                chat["participant2"]
                if chat["participant1"] == uid
                else chat["participant1"]
            )
            break

    # Run analysis pipeline on the message
    analysis = analyze_message(
        message=plaintext,
        chat_id=data.chatId,
        sender_id=uid,
        receiver_id=receiver_id or "",
        session_key=session_key,
        is_encrypted=False,  # Already decrypted above
    )

    # Store the message — include plaintext so it can be shown on reload
    # (plaintext is only used for display; ciphertext is the authoritative stored form)
    msg_id = fb.store_message({
        "chatId": data.chatId,
        "senderId": uid,
        "ciphertext": data.ciphertext,
        "plaintext": plaintext,          # ← store decrypted text
        "signature": data.signature,
        "threatStatus": analysis["status"],
        "confidence": analysis["confidence"],
        "method": analysis["method"],
    })

    # Update chat preview
    preview = plaintext[:40] if plaintext else ""
    fb.update_chat_last_message(data.chatId, preview)

    # Forward via WebSocket if receiver is connected
    if receiver_id and receiver_id in _ws_connections:
        try:
            await _ws_connections[receiver_id].send_json({
                "type": "new_message",
                "chatId": data.chatId,
                "messageId": msg_id,
                "senderId": uid,
                "ciphertext": data.ciphertext,
                "plaintext": plaintext,
                "sentAt": str(fb.get_messages(data.chatId, 1)[-1].get("sentAt", "")),
                "analysis": analysis,
            })
        except Exception:
            pass

    return {
        "messageId": msg_id,
        "analysis": analysis,
    }


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_endpoint(
    data: AnalyzeRequest,
    user: dict = Depends(get_current_user),
):
    """
    Standalone analysis endpoint.
    """
    uid = user["uid"]
    result = analyze_message(
        message=data.message,
        chat_id=data.chat_id,
        sender_id=data.sender_id,
        receiver_id=uid,
    )
    return AnalyzeResponse(**result)


@router.post("/permission")
async def set_permission(
    data: ChatPermissionUpdate,
    user: dict = Depends(get_current_user),
):
    """Set AI scanning consent for a specific chat partner."""
    uid = user["uid"]
    fb.set_chat_permission(uid, data.chatPartnerId, data.aiScanGranted)
    return {"success": True}


@router.get("/permission/{partner_id}")
async def get_permission(
    partner_id: str,
    user: dict = Depends(get_current_user),
):
    """Get AI scanning consent status for a chat partner."""
    uid = user["uid"]
    perm = fb.get_chat_permission(uid, partner_id)
    return {
        "aiScanGranted": perm.get("aiScanGranted", True) if perm else None,
        "hasDecided": perm is not None,
    }


@router.post("/dh-exchange")
async def dh_key_exchange(
    data: DHPublicKeyRequest,
    user: dict = Depends(get_current_user),
):
    """
    Diffie-Hellman key exchange.
    Client sends their public key, server generates its own pair,
    computes shared secret, derives Fernet key, and stores it.
    """
    uid = user["uid"]

    # Store client's public key
    fb.store_dh_public_key(data.chatId, uid, data.publicKey)

    # Generate server-side DH keypair
    server_private, server_public = dh_generate_keypair()

    # Compute shared secret
    shared_secret = dh_compute_shared_secret(data.publicKey, server_private)
    session_key = dh_derive_fernet_key(shared_secret)
    _session_keys[data.chatId] = session_key

    return DHPublicKeyResponse(publicKey=server_public)


# ──────────────────────────────────────────────
# WebSocket for real-time messaging
# ──────────────────────────────────────────────
@router.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    """
    WebSocket endpoint for real-time message delivery.
    Token is the Prism JWT passed as a path parameter.
    """
    try:
        decoded = verify_access_token(token)
        uid = decoded["uid"]
    except Exception:
        await websocket.close(code=4001, reason="Invalid token")
        return

    await websocket.accept()
    _ws_connections[uid] = websocket

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)

            if msg.get("type") == "typing":
                # Forward typing indicator to chat partner
                partner_id = msg.get("partnerId")
                if partner_id and partner_id in _ws_connections:
                    await _ws_connections[partner_id].send_json({
                        "type": "typing",
                        "chatId": msg.get("chatId"),
                        "senderId": uid,
                    })

            elif msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        _ws_connections.pop(uid, None)
    except Exception:
        _ws_connections.pop(uid, None)
