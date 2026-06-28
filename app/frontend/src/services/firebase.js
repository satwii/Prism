/**
 * Auth Service — Custom OTP-based auth. No Firebase.
 *
 * Flow:
 *   1. sendOtp(phone)       → POST /api/auth/send-otp   → OTP printed in backend terminal
 *   2. verifyOtp(phone, otp) → POST /api/auth/verify-otp → returns JWT token
 *   3. Every API call sends: Authorization: Bearer <token>
 *
 * Token is kept in sessionStorage so it survives page refreshes
 * within the same browser session.
 */
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ── In-memory + sessionStorage token store ──
let _token = sessionStorage.getItem('prism_token') || null;
let _uid = sessionStorage.getItem('prism_uid') || null;

const _listeners = [];

function _notify(user) {
    _listeners.forEach((cb) => cb(user));
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Request an OTP for the given phone number.
 * The backend prints the OTP to its terminal — no SMS is sent.
 * @param {string} phoneNumber — full international format e.g. +919876543210
 */
export async function sendOtp(phoneNumber) {
    const res = await axios.post(`${API_BASE}/api/auth/send-otp`, { phone: phoneNumber });
    return res.data;
}

/**
 * Verify an OTP. On success stores the JWT and notifies auth listeners.
 * @param {string} phoneNumber — same number used in sendOtp
 * @param {string} otp         — 6-digit code from backend logs
 */
export async function verifyOtp(phoneNumber, otp) {
    const res = await axios.post(`${API_BASE}/api/auth/verify-otp`, {
        phone: phoneNumber,
        otp,
    });
    _token = res.data.token;
    _uid = res.data.uid;
    sessionStorage.setItem('prism_token', _token);
    sessionStorage.setItem('prism_uid', _uid);
    const user = { uid: _uid };
    _notify(user);
    return user;
}

/**
 * Get the stored JWT for API calls.
 * Called automatically by the axios interceptor in api.js.
 */
export async function getIdToken() {
    return _token;
}

/**
 * Subscribe to auth state changes.
 * Fires immediately with the current state, then on every login/logout.
 * Returns an unsubscribe function (mirrors Firebase's onAuthStateChanged signature).
 */
export function onAuthChange(callback) {
    _listeners.push(callback);
    // Fire immediately so AuthContext gets the current state on mount
    const user = _uid ? { uid: _uid } : null;
    setTimeout(() => callback(user), 0);
    return () => {
        const i = _listeners.indexOf(callback);
        if (i >= 0) _listeners.splice(i, 1);
    };
}

/**
 * Sign out — clears the token and notifies listeners.
 */
export async function logout() {
    _token = null;
    _uid = null;
    sessionStorage.removeItem('prism_token');
    sessionStorage.removeItem('prism_uid');
    _notify(null);
}

// Kept for compatibility — nothing in the app needs this directly anymore
export const auth = { currentUser: null };
export default {};
