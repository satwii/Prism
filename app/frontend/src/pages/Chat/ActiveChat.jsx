/**
 * Active Chat Screen — the core messaging screen.
 * Full pipeline integration, consent modals, threat banners, message bubbles.
 *
 * KEY RULES:
 *  - AI threat detection badges/banners are shown ONLY on RECEIVED messages.
 *  - Sender sees NO analysis results — sent bubble shows no threat badge.
 *  - Receiver always has a "Report" option (even for SAFE messages).
 *  - Unknown-contact banner includes an "Add Contact" button.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { chatApi, reportApi, authApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import {
    aesEncrypt, aesDecrypt, getSessionKey, setSessionKey,
    dhGenerateKeypair, dhComputeSharedSecret, dhDeriveKey,
} from '../../services/encryption';

// Maps threat status → badge config for RECEIVED messages only
// Labels match the BERT model output: SAFE, AUTHORITY, URGENCY_SCARCITY, PERSUASION, PREDATORY_GROOMING
const THREAT_BADGE_CONFIG = {
    SAFE: { label: '✅ Safe', cls: 'bg-green-500/20 text-green-400 border border-green-500/30' },
    SUSPICIOUS: { label: '⚠️ Suspicious', cls: 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse' },
    AUTHORITY: { label: '⚠️ Authority Manipulation', cls: 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse' },
    URGENCY_SCARCITY: { label: '⏰ Urgency / Scarcity', cls: 'bg-orange-500/20 text-orange-400 border border-orange-500/40 animate-pulse' },
    PERSUASION: { label: '🧠 Persuasion Tactics', cls: 'bg-red-500/20 text-red-400 border border-red-500/40' },
    PREDATORY_GROOMING: { label: '🚨 Grooming Detected', cls: 'bg-red-600/30 text-red-300 border border-red-500/50' },
    BLOCKED_VECTOR: { label: '🚫 Known Scam Pattern', cls: 'bg-purple-500/20 text-purple-300 border border-purple-500/30' },
    BLOCKED_URL: { label: '🔗 Blocked URL', cls: 'bg-red-500/20 text-red-400 border border-red-500/30' },
};

// These are the labels the model actually emits for threats
const THREAT_CLASSES = new Set(['AUTHORITY', 'URGENCY_SCARCITY', 'PERSUASION', 'PREDATORY_GROOMING']);

export default function ActiveChat() {
    const { chatId } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { userProfile, authUser } = useAuth();
    const myUid = userProfile?.uid || authUser?.uid || sessionStorage.getItem('prism_uid');
    const messagesEndRef = useRef(null);

    const {
        partnerId = '',
        partnerName = 'Unknown',
        isKnownContact: initKnownContact = false,
        isVerifiedOrg = false,
        impersonationWarning = null,
    } = location.state || {};

    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [aiStatus, setAiStatus] = useState('active');
    const [showConsent, setShowConsent] = useState(false);
    const [showThreat, setShowThreat] = useState(null); // { status, confidence, matched_pattern, msgId }
    const [showReportConfirm, setShowReportConfirm] = useState(null);
    const [toast, setToast] = useState('');
    const [isKnownContact, setIsKnownContact] = useState(initKnownContact);
    const [addingContact, setAddingContact] = useState(false);

    useEffect(() => {
        initChat();
    }, [chatId]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const initChat = async () => {
        setLoading(true);
        try {
            if (isKnownContact && !isVerifiedOrg) {
                const permRes = await chatApi.getPermission(partnerId);
                if (!permRes.data.hasDecided) setShowConsent(true);
                if (permRes.data.aiScanGranted === false) setAiStatus('off');
            }
            if (!isKnownContact) setAiStatus('active');

            // DH key exchange
            const { privateKey, publicKey } = dhGenerateKeypair();
            const dhRes = await chatApi.dhExchange({ chatId, publicKey });
            const sharedSecret = dhComputeSharedSecret(dhRes.data.publicKey, privateKey);
            const sessionKey = dhDeriveKey(sharedSecret);
            setSessionKey(chatId, sessionKey);

            const msgRes = await chatApi.getMessages(chatId);
            setMessages(msgRes.data.messages || []);
        } catch (err) {
            console.error('Failed to init chat:', err);
        }
        setLoading(false);
    };

    const resolveText = (msg) => {
        if (msg.plaintext) return msg.plaintext;
        if (msg.ciphertext) return msg.ciphertext;
        return '[Message]';
    };

    const handleConsent = async (granted) => {
        try {
            await chatApi.setPermission({ chatPartnerId: partnerId, aiScanGranted: granted });
            setAiStatus(granted ? 'active' : 'off');
            setShowConsent(false);
        } catch (err) {
            console.error('Failed to set permission:', err);
        }
    };

    // ──────────────────────────────────────────────
    // Send — the sender NEVER sees analysis results.
    // We only store the message locally as a plain sent bubble.
    // The threat detection is received by the OTHER user via WebSocket.
    // ──────────────────────────────────────────────
    const handleSend = async () => {
        if (!newMessage.trim() || sending) return;
        setSending(true);

        const optimisticMsg = {
            id: `temp-${Date.now()}`,
            chatId,
            senderId: myUid,
            plaintext: newMessage,
            ciphertext: newMessage,
            sentAt: new Date().toISOString(),
            // Sender intentionally has NO threatStatus — analysis is for the RECEIVER only
            threatStatus: null,
            confidence: null,
        };

        setMessages((prev) => [...prev, optimisticMsg]);
        setNewMessage('');

        try {
            await chatApi.sendMessage({
                chatId,
                ciphertext: newMessage,
                signature: '',
            });
            // We intentionally do NOT read res.data.analysis here.
            // The sender receives no threat detection feedback.
        } catch (err) {
            console.error('Failed to send:', err);
            // Remove the optimistic message on failure
            setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
            showToast('Failed to send message. Please try again.');
        }
        setSending(false);
    };

    // ──────────────────────────────────────────────
    // WebSocket — incoming message from receiver side
    // When a new_message event arrives (from the OTHER user's send),
    // show the threat details to THIS user (the receiver).
    // ──────────────────────────────────────────────
    useEffect(() => {
        const token = sessionStorage.getItem('prism_token');
        if (!token) return;

        const ws = new WebSocket(`ws://localhost:8000/api/chat/ws/${token}`);

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'new_message' && data.chatId === chatId) {
                    const incoming = {
                        id: data.messageId,
                        chatId: data.chatId,
                        senderId: data.senderId,
                        plaintext: data.plaintext,
                        ciphertext: data.ciphertext,
                        sentAt: data.sentAt || new Date().toISOString(),
                        // Attach analysis ONLY to the received message (receiver perspective)
                        threatStatus: data.analysis?.status || null,
                        confidence: data.analysis?.confidence || null,
                        matched_pattern: data.analysis?.matched_pattern || null,
                    };
                    setMessages((prev) => [...prev, incoming]);

                    // Show threat banner for the RECEIVER when a threat is detected
                    const status = data.analysis?.status;
                    if (THREAT_CLASSES.has(status) || status === 'BLOCKED_VECTOR' || status === 'BLOCKED_URL') {
                        setShowThreat({
                            status,
                            confidence: data.analysis?.confidence || 0,
                            matched_pattern: data.analysis?.matched_pattern,
                            msgId: data.messageId,
                        });
                    }
                }
            } catch (e) {
                // ignore parse errors
            }
        };

        return () => ws.close();
    }, [chatId]);

    const handleReport = async (msg) => {
        try {
            await reportApi.reportScam({
                messageContent: msg.plaintext || msg.ciphertext,
                chatId,
            });
            setShowReportConfirm(null);
            showToast('Report submitted. Thank you for helping protect other users.');
        } catch (err) {
            console.error('Failed to report:', err);
            showToast('Report failed. Please try again.');
        }
    };

    const handleAddContact = async () => {
        setAddingContact(true);
        try {
            // We need the partner's phone hash to add them as a contact.
            // Fetch from backend using the partnerId.
            const res = await authApi.getUserInfo(partnerId);
            const phoneHash = res.data.phoneHash;
            if (!phoneHash) throw new Error('No phone hash available');
            await authApi.addContact(phoneHash);
            setIsKnownContact(true);
            showToast(`${partnerName} added to contacts. Scanning preference set to "Ask".`);
        } catch (err) {
            console.error('Add contact failed:', err);
            showToast('Could not add contact. Please try again.');
        }
        setAddingContact(false);
    };

    const showToast = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(''), 3500);
    };

    return (
        <div className="min-h-screen bg-navy-900 flex flex-col">
            {/* ── Top Bar ── */}
            <div className="sticky top-0 z-50 bg-navy-800/90 backdrop-blur-xl border-b border-white/5">
                <div className="max-w-2xl mx-auto px-4 py-3">
                    <div className="flex items-center gap-3">
                        <button onClick={() => navigate('/chats')} className="text-gray-400 hover:text-white transition-colors">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>

                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-bold text-sm">
                                {partnerName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                            </span>
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-white truncate">{partnerName}</span>
                                {isVerifiedOrg && <span className="text-blue-400" title="Verified Organization">🛡️</span>}
                            </div>
                            {/* AI Status Pill */}
                            <button
                                onClick={() => { if (isKnownContact) setShowConsent(true); }}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium mt-0.5 transition-all ${aiStatus === 'active'
                                    ? 'bg-green-500/20 text-green-400'
                                    : aiStatus === 'off'
                                        ? 'bg-gray-500/20 text-gray-400'
                                        : 'bg-amber-500/20 text-amber-400'
                                    }`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${aiStatus === 'active' ? 'bg-green-400' : aiStatus === 'off' ? 'bg-gray-400' : 'bg-amber-400'
                                    }`} />
                                {aiStatus === 'active' ? 'AI Scanning Active' : aiStatus === 'off' ? 'Private Chat — Scanning Off' : 'Monitoring'}
                            </button>
                        </div>

                        {/* Call button stub */}
                        <button
                            onClick={() => showToast('Connecting...')}
                            className="w-9 h-9 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 hover:bg-green-500/30 transition-all"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Unknown Contact Banner (with Add Contact) ── */}
            {!isKnownContact && (
                <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-3">
                    <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <span className="text-amber-400 text-lg">⚠️</span>
                            <p className="text-amber-300 text-sm">
                                This person is not in your contacts. AI safety scanning is <strong>ON</strong>.
                            </p>
                        </div>
                        <button
                            onClick={handleAddContact}
                            disabled={addingContact}
                            className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 text-xs font-semibold transition-all disabled:opacity-50"
                        >
                            {addingContact ? '...' : '+ Add Contact'}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Impersonation Warning ── */}
            {impersonationWarning && (
                <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2.5">
                    <div className="max-w-2xl mx-auto flex items-center gap-2">
                        <span className="text-red-400">🚨</span>
                        <p className="text-red-300 text-sm">
                            This sender is NOT a verified organization. They may be impersonating <strong>{impersonationWarning}</strong>. Exercise extreme caution.
                        </p>
                    </div>
                </div>
            )}

            {/* ── Messages Area ── */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
                <div className="max-w-2xl mx-auto space-y-3">
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : messages.length === 0 ? (
                        <div className="text-center py-20">
                            <p className="text-gray-500">No messages yet. Say hello! 👋</p>
                        </div>
                    ) : (
                        messages.map((msg) => {
                            const isSent = msg.senderId === myUid;
                            const isBlocked = !isSent && (
                                msg.threatStatus === 'BLOCKED_VECTOR' || msg.threatStatus === 'BLOCKED_URL'
                            );

                            // AI badge — ONLY for received messages
                            const threatBadge = (!isSent && msg.threatStatus)
                                ? THREAT_BADGE_CONFIG[msg.threatStatus] || null
                                : null;

                            return (
                                <div
                                    key={msg.id}
                                    className={`flex ${isSent ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div className={`group relative max-w-[80%] ${isSent ? 'order-last' : ''}`}>

                                        {/* Report button (hover) — ONLY for received messages */}
                                        {!isSent && (
                                            <button
                                                onClick={() => setShowReportConfirm(msg)}
                                                title="Report this message"
                                                className="absolute -right-8 top-1 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center text-red-400 text-xs"
                                            >
                                                🚩
                                            </button>
                                        )}

                                        {/* Message Bubble */}
                                        <div
                                            className={`rounded-2xl px-4 py-2.5 ${isSent
                                                ? 'bg-indigo-500 text-white rounded-br-md'
                                                : 'bg-white/10 text-white rounded-bl-md'
                                                } ${isBlocked ? 'opacity-60' : ''}`}
                                        >
                                            {isBlocked ? (
                                                <details className="cursor-pointer">
                                                    <summary className="text-red-300 text-sm font-medium">
                                                        🚫 Blocked — tap to reveal
                                                    </summary>
                                                    <p className="mt-2 text-sm">{resolveText(msg)}</p>
                                                </details>
                                            ) : (
                                                <p className="text-sm leading-relaxed">{resolveText(msg)}</p>
                                            )}
                                        </div>

                                        {/* Timestamp + AI badge row */}
                                        <div className={`flex items-center gap-2 mt-1 flex-wrap ${isSent ? 'justify-end' : 'justify-start'}`}>
                                            <span className="text-[10px] text-gray-500">
                                                {msg.sentAt ? new Date(msg.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                            </span>

                                            {/* AI badge — receiver only */}
                                            {threatBadge && (
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${threatBadge.cls}`}>
                                                    {threatBadge.label}
                                                    {msg.confidence != null && msg.threatStatus !== 'SAFE' && (
                                                        <span className="opacity-70">({Math.round(msg.confidence * 100)}%)</span>
                                                    )}
                                                </span>
                                            )}

                                            {/* Report link — receiver only, always visible */}
                                            {!isSent && (
                                                <button
                                                    onClick={() => setShowReportConfirm(msg)}
                                                    className="text-[10px] text-gray-600 hover:text-red-400 transition-colors"
                                                >
                                                    Report
                                                </button>
                                            )}
                                        </div>

                                        {/* Threat action row — RECEIVER only, for threat-classified messages */}
                                        {!isSent && THREAT_CLASSES.has(msg.threatStatus) && (
                                            <div className="mt-2 flex gap-2 flex-wrap">
                                                <button
                                                    onClick={() => setShowReportConfirm(msg)}
                                                    className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 transition-all"
                                                >
                                                    🚨 Report & Block
                                                </button>
                                                <button
                                                    onClick={() => showToast(`${partnerName} has been blocked.`)}
                                                    className="px-3 py-1.5 border border-red-500/50 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/10 transition-all"
                                                >
                                                    Block Sender
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* ── Threat Banner — RECEIVER only, shows on incoming threat message ── */}
            {showThreat && (
                <div className="bg-red-600 px-4 py-4 animate-slide-up border-t border-red-500">
                    <div className="max-w-2xl mx-auto">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <span className="text-white text-xl">🛡️</span>
                                <div>
                                    <span className="text-white font-bold text-lg">Threat Detected</span>
                                    <span className="ml-2 px-2 py-0.5 rounded-full bg-white/20 text-white text-xs font-semibold uppercase tracking-wide">
                                        {showThreat.status.replace(/_/g, ' ')}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowThreat(null)}
                                className="text-white/60 hover:text-white transition-colors text-xl leading-none"
                            >
                                ×
                            </button>
                        </div>
                        <p className="text-red-100 text-sm mb-3">
                            Confidence: {(showThreat.confidence * 100).toFixed(0)}%.
                            This message shows signs of <strong>{showThreat.status.replace(/_/g, ' ')}</strong>.
                            {showThreat.matched_pattern && ` Pattern: ${showThreat.matched_pattern}.`}
                        </p>
                        <div className="flex gap-2 flex-wrap">
                            <button
                                onClick={() => setShowThreat(null)}
                                className="px-4 py-2 border border-white/30 text-white rounded-lg text-sm font-medium hover:bg-white/10 transition-all"
                            >
                                View Anyway
                            </button>
                            <button
                                onClick={() => showToast(`${partnerName} has been blocked.`)}
                                className="px-4 py-2 border border-white/40 text-white rounded-lg text-sm font-medium hover:bg-white/10 transition-all"
                            >
                                Block Sender
                            </button>
                            <button
                                onClick={() => {
                                    const lastReceived = [...messages].reverse().find(m => m.senderId !== myUid);
                                    if (lastReceived) setShowReportConfirm(lastReceived);
                                    setShowThreat(null);
                                }}
                                className="px-4 py-2 bg-red-800 text-white rounded-lg text-sm font-bold hover:bg-red-900 transition-all"
                            >
                                🚨 Report & Block
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Input Bar ── */}
            <div className="sticky bottom-0 bg-navy-800/90 backdrop-blur-xl border-t border-white/5 px-4 py-3">
                <div className="max-w-2xl mx-auto flex items-center gap-2">
                    <input
                        id="chat-input"
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Type a message..."
                        className="flex-1 bg-navy-700 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                    <button
                        id="send-btn"
                        onClick={handleSend}
                        disabled={!newMessage.trim() || sending}
                        className="w-11 h-11 rounded-xl bg-indigo-500 flex items-center justify-center text-white hover:bg-indigo-600 transition-all disabled:opacity-50"
                    >
                        {sending ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>

            {/* ── Consent Modal (Known Contacts) ── */}
            {showConsent && (
                <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-sm flex items-end justify-center">
                    <div className="w-full max-w-md bg-navy-800 rounded-t-2xl border-t border-white/10 shadow-2xl p-6 animate-slide-up">
                        <h3 className="text-lg font-bold text-white mb-2">AI Scanning Consent</h3>
                        <p className="text-gray-400 text-sm mb-6">
                            Allow Prism AI to scan messages from <span className="text-white font-medium">{partnerName}</span>?
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => handleConsent(true)}
                                className="flex-1 py-3 bg-indigo-500 text-white rounded-xl font-semibold hover:bg-indigo-600 transition-all"
                            >
                                Allow Scanning
                            </button>
                            <button
                                onClick={() => handleConsent(false)}
                                className="flex-1 py-3 bg-navy-700 text-gray-300 rounded-xl font-semibold hover:bg-navy-600 transition-all"
                            >
                                Keep Private
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Report Confirmation Bottom Sheet ── */}
            {showReportConfirm && (
                <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-sm flex items-end justify-center">
                    <div className="w-full max-w-md bg-navy-800 rounded-t-2xl border-t border-white/10 shadow-2xl p-6 animate-slide-up">
                        <div className="flex items-center gap-3 mb-3">
                            <span className="text-2xl">🚩</span>
                            <h3 className="text-lg font-bold text-white">Report this message?</h3>
                        </div>
                        <div className="bg-navy-700/60 rounded-xl px-4 py-3 mb-4 border border-white/5">
                            <p className="text-gray-300 text-sm line-clamp-3">
                                "{resolveText(showReportConfirm)}"
                            </p>
                        </div>
                        <p className="text-gray-400 text-sm mb-5">
                            This helps Prism protect other users from similar threats. Your report is anonymous.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowReportConfirm(null)}
                                className="flex-1 py-3 bg-navy-700 text-gray-300 rounded-xl font-semibold hover:bg-navy-600 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleReport(showReportConfirm)}
                                className="flex-1 py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-all"
                            >
                                Report Message
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Toast ── */}
            {toast && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-70 bg-navy-700 border border-white/10 text-white px-6 py-3 rounded-xl shadow-2xl animate-slide-down">
                    {toast}
                </div>
            )}
        </div>
    );
}
