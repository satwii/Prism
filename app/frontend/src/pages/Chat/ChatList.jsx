/**
 * Chat List Page — conversation list with search, new chat, and contact status.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { chatApi, authApi } from '../../services/api';
import { sha256Hash } from '../../services/encryption';
import { useAuth } from '../../contexts/AuthContext';

const COUNTRY_CODES = [
    { code: '+91', flag: '🇮🇳', name: 'India' },
    { code: '+1', flag: '🇺🇸', name: 'USA' },
    { code: '+44', flag: '🇬🇧', name: 'UK' },
    { code: '+61', flag: '🇦🇺', name: 'Australia' },
    { code: '+81', flag: '🇯🇵', name: 'Japan' },
];

export default function ChatList() {
    const navigate = useNavigate();
    const { userProfile } = useAuth();
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showNewChat, setShowNewChat] = useState(false);

    // New chat search state
    const [searchCountryCode, setSearchCountryCode] = useState('+91');
    const [searchPhone, setSearchPhone] = useState('');

    const [searchResult, setSearchResult] = useState(null);
    const [searching, setSearching] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        loadChats();
    }, []);

    const loadChats = async () => {
        try {
            const res = await chatApi.getChatList();
            setChats(res.data.chats || []);
        } catch (err) {
            console.error('Failed to load chats:', err);
        }
        setLoading(false);
    };

    const handleSearch = async () => {
        if (!searchPhone.trim() || searchPhone.length < 5) return;
        setSearching(true);
        setSearchResult(null);
        setError('');
        try {
            // Build the full number the same way registration does:
            // countryCode (e.g. "+91") + digits only (e.g. "9876543210")
            const fullPhone = `${searchCountryCode}${searchPhone.trim()}`;
            const phoneHash = sha256Hash(fullPhone);
            console.log('[NewChat] Searching for hash of:', fullPhone, '→', phoneHash);
            const res = await authApi.lookupContact(phoneHash);
            setSearchResult(res.data);
        } catch (err) {
            setError('Search failed. Please try again.');
        }
        setSearching(false);
    };

    const handleStartChat = async () => {
        if (!searchResult?.uid) return;
        setSearching(true);
        try {
            const fullPhone = `${searchCountryCode}${searchPhone.trim()}`;
            const phoneHash = sha256Hash(fullPhone);
            const res = await chatApi.createChat(phoneHash);
            setShowNewChat(false);
            navigate(`/chat/${res.data.chatId}`, {
                state: {
                    partnerId: res.data.partner.uid,
                    partnerName: res.data.partner.displayName,
                    isKnownContact: res.data.isKnownContact,
                    impersonationWarning: res.data.impersonationWarning,
                },
            });
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to start chat');
        }
        setSearching(false);
    };

    const handleSaveContact = async () => {
        if (!searchResult?.uid) return;
        setSearching(true);
        try {
            const fullPhone = `${searchCountryCode}${searchPhone.trim()}`;
            const phoneHash = sha256Hash(fullPhone);
            await authApi.addContact(phoneHash);
            setSearchResult((prev) => ({ ...prev, _isSaved: true }));
            setError('');
        } catch (err) {
            setError('Failed to save contact. Try again.');
        }
        setSearching(false);
    };


    const getInitials = (name) => {
        if (!name) return '?';
        return name
            .split(' ')
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
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
                    <h1 className="text-lg font-bold text-white">Chats</h1>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowNewChat(true)}
                            className="px-3 py-1.5 rounded-lg bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-600 transition-all"
                        >
                            + New Chat
                        </button>
                    </div>
                </div>
            </div>

            {/* Chat List */}
            <div className="max-w-2xl mx-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : chats.length === 0 ? (
                    <div className="text-center py-20 px-4">
                        <div className="text-5xl mb-4">💬</div>
                        <h2 className="text-xl font-bold text-white mb-2">No conversations yet</h2>
                        <p className="text-gray-400 mb-6">Start a new chat to begin messaging with AI protection.</p>
                        <button
                            onClick={() => setShowNewChat(true)}
                            className="px-6 py-3 bg-indigo-500 text-white rounded-xl font-semibold hover:bg-indigo-600 transition-all"
                        >
                            Start New Chat
                        </button>
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {chats.map((chat) => (
                            <button
                                key={chat.chatId}
                                onClick={() =>
                                    navigate(`/chat/${chat.chatId}`, {
                                        state: {
                                            partnerId: chat.partnerId,
                                            partnerName: chat.partnerName,
                                            isKnownContact: chat.isKnownContact,
                                            isVerifiedOrg: chat.isVerifiedOrg,
                                        },
                                    })
                                }
                                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-white/5 transition-all text-left"
                            >
                                {/* Avatar */}
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                                    <span className="text-white font-bold text-sm">
                                        {getInitials(chat.partnerName)}
                                    </span>
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-white truncate">
                                            {chat.partnerName}
                                        </span>
                                        {/* Verified org badge */}
                                        {chat.isVerifiedOrg && (
                                            <span className="flex-shrink-0 text-blue-400" title="Verified Organization">
                                                🛡️
                                            </span>
                                        )}
                                        {/* Unknown contact warning */}
                                        {!chat.isKnownContact && (
                                            <span className="flex-shrink-0 text-amber-400 text-xs" title="Unknown Contact">
                                                ⚠️
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-400 truncate">
                                        {chat.lastMessage || 'No messages yet'}
                                    </p>
                                </div>

                                {/* Timestamp */}
                                <span className="text-xs text-gray-500 flex-shrink-0">
                                    {chat.lastMessageAt ? new Date(chat.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* New Chat Modal */}
            {showNewChat && (
                <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
                    <div className="w-full max-w-md bg-navy-800 rounded-2xl border border-white/10 shadow-2xl animate-slide-up">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-white">New Chat</h2>
                                <button
                                    onClick={() => {
                                        setShowNewChat(false);
                                        setSearchResult(null);
                                        setSearchPhone('');
                                        setError('');
                                    }}
                                    className="text-gray-400 hover:text-white transition-colors"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-2">
                                        Phone Number
                                    </label>
                                    <div className="flex gap-2">
                                        {/* Country code selector — must match registration */}
                                        <select
                                            value={searchCountryCode}
                                            onChange={(e) => setSearchCountryCode(e.target.value)}
                                            className="bg-navy-700 border border-white/10 rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        >
                                            {COUNTRY_CODES.map((c) => (
                                                <option key={c.code} value={c.code}>
                                                    {c.flag} {c.code}
                                                </option>
                                            ))}
                                        </select>
                                        <input
                                            type="tel"
                                            value={searchPhone}
                                            onChange={(e) => setSearchPhone(e.target.value.replace(/\D/g, ''))}
                                            placeholder="Enter digits only"
                                            className="flex-1 bg-navy-700 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                        />
                                        <button
                                            onClick={handleSearch}
                                            disabled={searching || searchPhone.length < 5}
                                            className="px-4 py-3 bg-indigo-500 text-white rounded-xl font-semibold hover:bg-indigo-600 transition-all disabled:opacity-50"
                                        >
                                            {searching ? '...' : '🔍'}
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">
                                        Enter the number exactly as registered. Phone is hashed before lookup — never sent in plaintext.
                                    </p>
                                </div>

                                {searchResult && (
                                    <div className="bg-navy-700/50 rounded-xl p-4 animate-fade-in">
                                        {searchResult.found ? (
                                            <div>
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                                                            <span className="text-white font-bold text-sm">
                                                                {getInitials(searchResult.displayName)}
                                                            </span>
                                                        </div>
                                                        <span className="text-white font-medium">{searchResult.displayName}</span>
                                                    </div>
                                                    <button
                                                        onClick={handleStartChat}
                                                        className="px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600 transition-all"
                                                    >
                                                        Start Chat
                                                    </button>
                                                </div>
                                                {/* Save Contact button */}
                                                <button
                                                    onClick={handleSaveContact}
                                                    disabled={searching || searchResult._isSaved}
                                                    className={`w-full py-2 rounded-lg text-sm font-medium transition-all ${searchResult._isSaved
                                                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                                            : 'bg-white/5 text-gray-300 border border-white/10 hover:bg-white/10'
                                                        }`}
                                                >
                                                    {searchResult._isSaved ? '✓ Saved to Contacts' : '+ Save as Contact'}
                                                </button>
                                            </div>
                                        ) : (
                                            <p className="text-gray-400 text-center">User not found</p>
                                        )}
                                    </div>
                                )}

                                {error && (
                                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                                        <p className="text-red-400 text-sm text-center">{error}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
