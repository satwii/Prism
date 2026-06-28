/**
 * Home Page — Feature card grid with nav bar.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const FEATURES = [
    {
        icon: '💬',
        title: 'Chat',
        subtitle: 'Start or continue a conversation. AI scanning active.',
        path: '/chats',
        gradient: 'from-indigo-500 to-purple-600',
    },
    {
        icon: '🛡️',
        title: 'My Profile',
        subtitle: 'View your trust score, ratings, and verification badges.',
        path: '/profile',
        gradient: 'from-indigo-600 to-blue-600',
    },
    {
        icon: '⚙️',
        title: 'Settings',
        subtitle: 'Manage AI consent, privacy preferences, blocked contacts.',
        path: '/settings',
        gradient: 'from-indigo-500 to-indigo-700',
    },
];

export default function HomePage() {
    const navigate = useNavigate();
    const { userProfile, logout } = useAuth();

    return (
        <div className="min-h-screen bg-navy-900">
            {/* Navigation Bar */}
            <nav className="sticky top-0 z-50 bg-navy-800/90 backdrop-blur-xl border-b border-white/5">
                <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                            <span className="text-lg">🔮</span>
                        </div>
                        <span className="font-bold text-white text-lg">Prism</span>
                    </div>

                    <span className="text-gray-300 font-medium hidden sm:block">
                        {userProfile?.displayName}
                    </span>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate('/profile')}
                            className="w-9 h-9 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 hover:bg-indigo-500/30 transition-all"
                            title="Profile"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </button>
                        <button
                            onClick={logout}
                            className="px-4 py-2 rounded-xl bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 text-sm font-medium transition-all"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </nav>

            {/* Hero Section */}
            <div className="max-w-5xl mx-auto px-4 pt-10 pb-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
                    Welcome back, <span className="text-indigo-400">{userProfile?.displayName}</span>
                </h1>
                <p className="text-gray-400">Your conversations are protected by AI-powered safety scanning.</p>
            </div>

            {/* Feature Cards Grid */}
            <div className="max-w-5xl mx-auto px-4 pb-12">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {FEATURES.map((feature) => (
                        <button
                            key={feature.title}
                            onClick={() => navigate(feature.path)}
                            className={`group relative overflow-hidden bg-gradient-to-br ${feature.gradient} rounded-2xl p-6 text-left shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all duration-300`}
                        >
                            {/* Glow effect */}
                            <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-all duration-300" />

                            <div className="relative">
                                <span className="text-4xl mb-4 block">{feature.icon}</span>
                                <h2 className="text-xl font-bold text-white mb-1">{feature.title}</h2>
                                <p className="text-white/70 text-sm leading-relaxed">{feature.subtitle}</p>
                            </div>

                            {/* Arrow */}
                            <div className="absolute bottom-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-all">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                        </button>
                    ))}

                    {/* Admin Panel Card — visible only if isAdmin */}
                    {userProfile?.isAdmin && (
                        <button
                            onClick={() => navigate('/admin')}
                            className="group relative overflow-hidden bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-6 text-left shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all duration-300"
                        >
                            <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-all duration-300" />
                            <div className="relative">
                                <span className="text-4xl mb-4 block">⚙️</span>
                                <h2 className="text-xl font-bold text-white mb-1">Admin Panel</h2>
                                <p className="text-white/70 text-sm leading-relaxed">
                                    Review reported messages and org requests.
                                </p>
                            </div>
                            <div className="absolute bottom-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-all">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
