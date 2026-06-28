/**
 * Settings Page — AI consent management, privacy preferences.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { chatApi } from '../../services/api';

export default function SettingsPage() {
    const navigate = useNavigate();
    const { userProfile, logout } = useAuth();
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [permissions, setPermissions] = useState({});

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const chatsRes = await chatApi.getChatList();
            const chatList = chatsRes.data.chats || [];
            setChats(chatList);

            // Load permissions for each chat partner
            const perms = {};
            for (const chat of chatList) {
                try {
                    const permRes = await chatApi.getPermission(chat.partnerId);
                    perms[chat.partnerId] = permRes.data.aiScanGranted;
                } catch {
                    perms[chat.partnerId] = null;
                }
            }
            setPermissions(perms);
        } catch (err) {
            console.error('Failed to load settings:', err);
        }
        setLoading(false);
    };

    const togglePermission = async (partnerId, currentValue) => {
        const newValue = !currentValue;
        try {
            await chatApi.setPermission({
                chatPartnerId: partnerId,
                aiScanGranted: newValue,
            });
            setPermissions((prev) => ({ ...prev, [partnerId]: newValue }));
        } catch (err) {
            console.error('Failed to update permission:', err);
        }
    };

    return (
        <div className="min-h-screen bg-navy-900">
            {/* Top Bar */}
            <div className="sticky top-0 z-50 bg-navy-800/90 backdrop-blur-xl border-b border-white/5">
                <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
                    <button onClick={() => navigate('/home')} className="text-gray-400 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <h1 className="text-lg font-bold text-white">Settings</h1>
                    <div className="w-6" />
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
                {/* AI Consent Section */}
                <div className="bg-navy-800 rounded-xl border border-white/5 overflow-hidden">
                    <div className="px-5 py-4 border-b border-white/5">
                        <h2 className="font-semibold text-white">AI Scanning Consent</h2>
                        <p className="text-xs text-gray-400 mt-1">
                            Manage which contacts have AI scanning active. Private chats have zero data processing.
                        </p>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-10">
                            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : chats.length === 0 ? (
                        <div className="text-center py-10 text-gray-500 text-sm">No conversations yet</div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {chats.map((chat) => (
                                <div key={chat.chatId} className="px-5 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500/50 to-purple-600/50 flex items-center justify-center">
                                            <span className="text-white text-xs font-bold">
                                                {chat.partnerName?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="text-white text-sm font-medium">{chat.partnerName}</p>
                                            <p className="text-xs text-gray-500">
                                                {!chat.isKnownContact ? 'Unknown — scanning mandatory' :
                                                    permissions[chat.partnerId] === true ? 'Scanning active' :
                                                        permissions[chat.partnerId] === false ? 'Private — no scanning' : 'No preference set'}
                                            </p>
                                        </div>
                                    </div>

                                    {chat.isKnownContact && (
                                        <button
                                            onClick={() => togglePermission(chat.partnerId, permissions[chat.partnerId])}
                                            className={`relative w-11 h-6 rounded-full transition-all ${permissions[chat.partnerId] ? 'bg-indigo-500' : 'bg-navy-600'
                                                }`}
                                        >
                                            <div
                                                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${permissions[chat.partnerId] ? 'translate-x-5.5 left-0.5' : 'left-0.5'
                                                    }`}
                                                style={{ transform: permissions[chat.partnerId] ? 'translateX(22px)' : 'translateX(0)' }}
                                            />
                                        </button>
                                    )}

                                    {!chat.isKnownContact && (
                                        <span className="text-amber-400 text-xs">Always on</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Privacy Info */}
                <div className="bg-navy-800 rounded-xl border border-white/5 p-5">
                    <h2 className="font-semibold text-white mb-3">Privacy Guarantees</h2>
                    <ul className="space-y-2 text-sm text-gray-400">
                        <li className="flex items-start gap-2">
                            <span className="text-green-400 mt-0.5">✓</span>
                            Phone numbers are never stored in plaintext
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-green-400 mt-0.5">✓</span>
                            RSA private keys never leave your device
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-green-400 mt-0.5">✓</span>
                            All AI inference runs locally — no cloud APIs
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-green-400 mt-0.5">✓</span>
                            Private contacts' messages are never analyzed
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-green-400 mt-0.5">✓</span>
                            End-to-end encrypted with Fernet AES-128
                        </li>
                    </ul>
                </div>

                {/* Account Actions */}
                <div className="bg-navy-800 rounded-xl border border-white/5 overflow-hidden">
                    <button
                        onClick={logout}
                        className="w-full px-5 py-4 text-left text-red-400 hover:bg-red-500/5 transition-colors text-sm font-medium"
                    >
                        Sign Out
                    </button>
                </div>
            </div>
        </div>
    );
}
