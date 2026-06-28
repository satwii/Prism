/**
 * API Service — Axios instance with Firebase ID Token interceptor.
 * Every request includes Authorization: Bearer <token>.
 */
import axios from 'axios';
import { getIdToken } from './firebase';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
    baseURL: API_BASE,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// ── Request Interceptor — attach Firebase ID Token ──
api.interceptors.request.use(
    async (config) => {
        const token = await getIdToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// ── Response Interceptor — handle errors ──
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Token expired or invalid — redirect to login
            window.location.href = '/';
        }
        return Promise.reject(error);
    }
);

// ──────────────────────────────────────────────
// Auth API
// ──────────────────────────────────────────────
export const authApi = {
    register: (data) => api.post('/api/auth/register', data),
    getProfile: () => api.get('/api/auth/me'),
    updateProfile: (data) => api.put('/api/auth/me', data),
    lookupContact: (phoneHash) => api.post('/api/auth/lookup', { phoneHash }),
    addContact: (phoneHash) => api.post('/api/auth/contacts/add', { phoneHash }),
    getUserInfo: (uid) => api.get(`/api/auth/user/${uid}`),  // look up another user's public info
    getContacts: () => api.get('/api/auth/contacts'),
    rateUser: (data) => api.post('/api/auth/ratings', data),
    getRatings: (userId) => api.get(`/api/auth/ratings/${userId}`),
    getRsaKey: () => api.post('/api/auth/rsa-public-key'),
};

// ──────────────────────────────────────────────
// Chat API
// ──────────────────────────────────────────────
export const chatApi = {
    createChat: (contactPhoneHash) => api.post('/api/chat/new', { contactPhoneHash }),
    getChatList: () => api.get('/api/chat/list'),
    getMessages: (chatId) => api.get(`/api/chat/messages/${chatId}`),
    sendMessage: (data) => api.post('/api/chat/send', data),
    analyzeMessage: (data) => api.post('/api/chat/analyze', data),
    setPermission: (data) => api.post('/api/chat/permission', data),
    getPermission: (partnerId) => api.get(`/api/chat/permission/${partnerId}`),
    dhExchange: (data) => api.post('/api/chat/dh-exchange', data),
};

// ──────────────────────────────────────────────
// Reports API
// ──────────────────────────────────────────────
export const reportApi = {
    reportScam: (data) => api.post('/api/reports/', data),
    getMyReports: () => api.get('/api/reports/my-reports'),
};

// ──────────────────────────────────────────────
// Organizations API
// ──────────────────────────────────────────────
export const orgApi = {
    register: (data) => api.post('/api/organizations/register', data),
    getVerified: () => api.get('/api/organizations/verified'),
    getOrg: (orgId) => api.get(`/api/organizations/${orgId}`),
};

// ──────────────────────────────────────────────
// Admin API
// ──────────────────────────────────────────────
export const adminApi = {
    getReports: (status = 'all') => api.get(`/api/admin/reports?status=${status}`),
    confirmScam: (reportId) => api.post(`/api/admin/reports/${reportId}/confirm`),
    dismissReport: (reportId) => api.post(`/api/admin/reports/${reportId}/dismiss`),
    getOrgRequests: (status = 'pending') => api.get(`/api/admin/organizations?status=${status}`),
    approveOrg: (orgId) => api.post(`/api/admin/organizations/${orgId}/approve`),
    rejectOrg: (orgId, rejectionNote) => api.post(`/api/admin/organizations/${orgId}/reject`, { rejectionNote }),
    getVectorStats: () => api.get('/api/admin/vector-stats'),
    deleteVector: (chromaId) => api.delete(`/api/admin/vectors/${chromaId}`),
    getBlocklist: () => api.get('/api/admin/blocklist'),
    addToBlocklist: (domain) => api.post('/api/admin/blocklist', { domain }),
    getLogs: () => api.get('/api/admin/logs'),
};

export default api;
