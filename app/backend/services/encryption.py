"""
Encryption Service — Diffie-Hellman, Fernet AES-128, RSA 2048-bit, SHA-256
Implements the four-layer encryption pipeline for Prism.
"""
import secrets
import hashlib
import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.asymmetric import rsa, padding as asym_padding
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.backends import default_backend


# ──────────────────────────────────────────────
# SHA-256 Hashing
# ──────────────────────────────────────────────
def sha256_hash(data: str) -> str:
    """Return hex-encoded SHA-256 hash of the input string."""
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


# ──────────────────────────────────────────────
# Diffie-Hellman Key Exchange
# ──────────────────────────────────────────────
# DEMO values — production should use 2048-bit primes per RFC 3526.
# Example production upgrade:
#   from cryptography.hazmat.primitives.asymmetric.dh import generate_parameters
#   params = generate_parameters(generator=2, key_size=2048, backend=default_backend())
DH_P = 23   # small prime for demo
DH_G = 5    # generator for demo


def dh_generate_keypair() -> tuple[int, int]:
    """
    Generate a DH private key and public key.
    Returns (private_key, public_key).
    """
    private_key = secrets.randbelow(DH_P - 2) + 1  # 1..p-2
    public_key = pow(DH_G, private_key, DH_P)
    return private_key, public_key


def dh_compute_shared_secret(their_public: int, my_private: int) -> int:
    """Compute the shared DH secret."""
    return pow(their_public, my_private, DH_P)


def dh_derive_fernet_key(shared_secret: int) -> bytes:
    """
    Derive a Fernet-compatible AES key from the DH shared secret.
    Fernet requires a 32-byte URL-safe base64-encoded key.
    We SHA-256 hash the shared secret to get 32 bytes, then base64 encode.
    """
    raw = hashlib.sha256(str(shared_secret).encode()).digest()
    return base64.urlsafe_b64encode(raw)


# ──────────────────────────────────────────────
# AES-128 Fernet Encryption / Decryption
# ──────────────────────────────────────────────
def fernet_encrypt(plaintext: str, key: bytes) -> str:
    """Encrypt plaintext with Fernet (AES-128-CBC + HMAC-SHA256)."""
    f = Fernet(key)
    return f.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def fernet_decrypt(ciphertext: str, key: bytes) -> str:
    """Decrypt ciphertext with Fernet. Raises on tamper detection."""
    f = Fernet(key)
    return f.decrypt(ciphertext.encode("utf-8")).decode("utf-8")


# ──────────────────────────────────────────────
# RSA 2048-bit Digital Signatures
# ──────────────────────────────────────────────
def rsa_generate_keypair() -> tuple[bytes, bytes]:
    """
    Generate a 2048-bit RSA key pair.
    Returns (private_key_pem, public_key_pem) as bytes.
    Private key NEVER leaves the client device.
    """
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend(),
    )
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return private_pem, public_pem


def rsa_sign(message: str, private_key_pem: bytes) -> str:
    """
    Sign a message with RSA-PSS + SHA-256.
    Returns base64-encoded signature.
    """
    private_key = serialization.load_pem_private_key(
        private_key_pem, password=None, backend=default_backend()
    )
    signature = private_key.sign(
        message.encode("utf-8"),
        asym_padding.PSS(
            mgf=asym_padding.MGF1(hashes.SHA256()),
            salt_length=asym_padding.PSS.MAX_LENGTH,
        ),
        hashes.SHA256(),
    )
    return base64.b64encode(signature).decode("utf-8")


def rsa_verify(message: str, signature_b64: str, public_key_pem: bytes) -> bool:
    """
    Verify an RSA-PSS + SHA-256 signature.
    Returns True if valid, False otherwise.
    """
    try:
        public_key = serialization.load_pem_public_key(
            public_key_pem, backend=default_backend()
        )
        signature = base64.b64decode(signature_b64)
        public_key.verify(
            signature,
            message.encode("utf-8"),
            asym_padding.PSS(
                mgf=asym_padding.MGF1(hashes.SHA256()),
                salt_length=asym_padding.PSS.MAX_LENGTH,
            ),
            hashes.SHA256(),
        )
        return True
    except Exception:
        return False
