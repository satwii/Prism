/**
 * Client-side Encryption Service
 * DH key exchange, AES Fernet encrypt/decrypt, RSA sign, SHA-256 hash.
 */
import CryptoJS from 'crypto-js';

// DH Demo Parameters (must match backend)
// Production upgrade: use 2048-bit primes per RFC 3526
const DH_P = 23;
const DH_G = 5;

/**
 * SHA-256 hash of a string.
 */
export function sha256Hash(data) {
    return CryptoJS.SHA256(data).toString(CryptoJS.enc.Hex);
}

/**
 * Generate DH key pair.
 * @returns {{ privateKey: number, publicKey: number }}
 */
export function dhGenerateKeypair() {
    const privateKey = Math.floor(Math.random() * (DH_P - 2)) + 1;
    const publicKey = modPow(DH_G, privateKey, DH_P);
    return { privateKey, publicKey };
}

/**
 * Compute DH shared secret.
 */
export function dhComputeSharedSecret(theirPublic, myPrivate) {
    return modPow(theirPublic, myPrivate, DH_P);
}

/**
 * Derive AES key from DH shared secret.
 * Returns a CryptoJS-compatible key.
 */
export function dhDeriveKey(sharedSecret) {
    return CryptoJS.SHA256(sharedSecret.toString()).toString();
}

/**
 * AES encrypt (simulating Fernet on client).
 * Uses AES-CBC with PKCS7 padding.
 */
export function aesEncrypt(plaintext, keyHex) {
    const key = CryptoJS.enc.Hex.parse(keyHex);
    const iv = CryptoJS.lib.WordArray.random(16);
    const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
    });
    // Prepend IV to ciphertext for transport
    const combined = iv.concat(encrypted.ciphertext);
    return CryptoJS.enc.Base64.stringify(combined);
}

/**
 * AES decrypt.
 */
export function aesDecrypt(ciphertextB64, keyHex) {
    try {
        const key = CryptoJS.enc.Hex.parse(keyHex);
        const combined = CryptoJS.enc.Base64.parse(ciphertextB64);
        const iv = CryptoJS.lib.WordArray.create(combined.words.slice(0, 4), 16);
        const ciphertext = CryptoJS.lib.WordArray.create(combined.words.slice(4), combined.sigBytes - 16);
        const decrypted = CryptoJS.AES.decrypt(
            { ciphertext: ciphertext },
            key,
            { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
        );
        return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (e) {
        console.error('Decryption failed:', e);
        return null;
    }
}

/**
 * Modular exponentiation: (base^exp) mod mod
 */
function modPow(base, exp, mod) {
    let result = 1;
    base = base % mod;
    while (exp > 0) {
        if (exp % 2 === 1) {
            result = (result * base) % mod;
        }
        exp = Math.floor(exp / 2);
        base = (base * base) % mod;
    }
    return result;
}

/**
 * Store RSA private key in memory (session only).
 * NEVER stored in localStorage.
 */
let _rsaPrivateKey = null;

export function setRsaPrivateKey(pem) {
    _rsaPrivateKey = pem;
}

export function getRsaPrivateKey() {
    return _rsaPrivateKey;
}

/**
 * Store session encryption key in memory.
 */
const _sessionKeys = {};

export function setSessionKey(chatId, key) {
    _sessionKeys[chatId] = key;
}

export function getSessionKey(chatId) {
    return _sessionKeys[chatId] || null;
}
