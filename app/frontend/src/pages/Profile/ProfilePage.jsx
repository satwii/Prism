/**
 * Profile Page — Trust score, badges, ratings, report history, AI consent.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { authApi, reportApi, chatApi } from '../../services/api';

export default function ProfilePage() {
    const navigate = useNavigate();
    const { userProfile, refreshProfile } = useAuth();
    const [ratings, setRatings] = useState({ averageRating: 0, totalRatings: 0 });
    const [reports, setReports] = useState({ total: 0, confirmed: 0, dismissed: 0, pending: 0 });
    const [loading, setLoading] = useState(true);
    const [editMode, setEditMode] = useState(false);
    const [editName, setEditName] = useState('');
    const [editEmergencyName, setEditEmergencyName] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [ratingsRes, reportsRes] = await Promise.all([
                authApi.getRatings(userProfile?.uid),
                reportApi.getMyReports(),
            ]);
            setRatings(ratingsRes.data);
            setReports(reportsRes.data.summary || {});
        } catch (err) {
            console.error('Failed to load profile data:', err);
        }
        setLoading(false);
    };

    const handleSave = async () => {
        try {
            const updates = {};
            if (editName) updates.displayName = editName;
            if (editEmergencyName) updates.emergencyContactName = editEmergencyName;
            await authApi.updateProfile(updates);
            await refreshProfile();
            setEditMode(false);
        } catch (err) {
            console.error('Failed to update:', err);
        }
    };

    const getInitials = (name) => {
        if (!name) return '?';
        return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    };

    const getBadges = () => {
        const badges = [];
        if ((userProfile?.tripCount || 0) < 3) {
            badges.push({ icon: '🌱', label: 'New to Prism', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' });
        }
        if ((userProfile?.tripCount || 0) > 10) {
            badges.push({ icon: '✓', label: 'Trusted User', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' });
        }
        return badges;
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
                    <h1 className="text-lg font-bold text-white">My Profile</h1>
                    <button
                        onClick={() => setEditMode(!editMode)}
                        className="text-indigo-400 text-sm font-medium hover:text-indigo-300 transition-colors"
                    >
                        {editMode ? 'Cancel' : 'Edit'}
                    </button>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-4 py-8">
                {/* Avatar & Name */}
                <div className="text-center mb-8">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-indigo-500/20">
                        <span className="text-white font-bold text-2xl">
                            {getInitials(userProfile?.displayName)}
                        </span>
                    </div>
                    {editMode ? (
                        <input
                            type="text"
                            defaultValue={userProfile?.displayName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="bg-navy-700 border border-white/10 rounded-xl px-4 py-2 text-white text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full max-w-xs mx-auto"
                        />
                    ) : (
                        <h2 className="text-2xl font-bold text-white">{userProfile?.displayName}</h2>
                    )}

                    {/* Trust Score / Rating */}
                    <div className="flex items-center justify-center gap-2 mt-3">
                        <span className="text-2xl">⭐</span>
                        <span className="text-xl font-bold text-white">{ratings.averageRating.toFixed(1)}</span>
                        <span className="text-gray-400 text-sm">({ratings.totalRatings} ratings)</span>
                    </div>
                </div>

                {/* Verification Badges */}
                <div className="flex flex-wrap justify-center gap-2 mb-8">
                    {getBadges().map((badge, i) => (
                        <span
                            key={i}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${badge.color}`}
                        >
                            <span>{badge.icon}</span>
                            {badge.label}
                        </span>
                    ))}
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 gap-3 mb-8">
                    <div className="bg-navy-800 rounded-xl p-4 border border-white/5">
                        <p className="text-gray-400 text-sm">Interactions</p>
                        <p className="text-2xl font-bold text-white">{userProfile?.tripCount || 0}</p>
                    </div>
                    <div className="bg-navy-800 rounded-xl p-4 border border-white/5">
                        <p className="text-gray-400 text-sm">Reports Submitted</p>
                        <p className="text-2xl font-bold text-white">{reports.total || 0}</p>
                    </div>
                </div>

                {/* Emergency Contact */}
                <div className="bg-navy-800 rounded-xl p-5 border border-white/5 mb-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-white">Emergency Contact</h3>
                    </div>
                    {editMode ? (
                        <input
                            type="text"
                            defaultValue={userProfile?.emergencyContactName}
                            onChange={(e) => setEditEmergencyName(e.target.value)}
                            className="bg-navy-700 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
                            placeholder="Emergency contact name"
                        />
                    ) : (
                        <p className="text-gray-300">{userProfile?.emergencyContactName || 'Not set'}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-2">Phone number is hidden for privacy.</p>
                </div>

                {/* Report History */}
                <div className="bg-navy-800 rounded-xl p-5 border border-white/5 mb-4">
                    <h3 className="font-semibold text-white mb-3">Report History</h3>
                    <div className="grid grid-cols-3 gap-2">
                        <div className="text-center p-3 bg-navy-700 rounded-lg">
                            <p className="text-lg font-bold text-amber-400">{reports.pending || 0}</p>
                            <p className="text-xs text-gray-400">Pending</p>
                        </div>
                        <div className="text-center p-3 bg-navy-700 rounded-lg">
                            <p className="text-lg font-bold text-green-400">{reports.confirmed || 0}</p>
                            <p className="text-xs text-gray-400">Confirmed</p>
                        </div>
                        <div className="text-center p-3 bg-navy-700 rounded-lg">
                            <p className="text-lg font-bold text-gray-400">{reports.dismissed || 0}</p>
                            <p className="text-xs text-gray-400">Dismissed</p>
                        </div>
                    </div>
                </div>



                {/* Save Button */}
                {editMode && (
                    <button
                        onClick={handleSave}
                        className="w-full py-3 bg-indigo-500 text-white rounded-xl font-bold hover:bg-indigo-600 transition-all mt-4"
                    >
                        Save Changes
                    </button>
                )}
            </div>
        </div>
    );
}
