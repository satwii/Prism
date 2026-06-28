/**
 * Admin Dashboard — server-side admin verification on every route.
 * 3 Tabs: Reported Messages, Organization Requests, Vector DB Stats.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

export default function AdminDashboard() {
    const navigate = useNavigate();
    const { userProfile } = useAuth();
    const [activeTab, setActiveTab] = useState('reports');
    const [reports, setReports] = useState([]);
    const [orgs, setOrgs] = useState([]);
    const [vectorStats, setVectorStats] = useState({ total_vectors: 0, recent_patterns: [] });
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [rejectNote, setRejectNote] = useState('');
    const [showReject, setShowReject] = useState(null);
    const [toast, setToast] = useState('');

    // Client-side guard (server verifies too)
    useEffect(() => {
        if (userProfile && !userProfile.isAdmin) {
            navigate('/home');
        }
    }, [userProfile]);

    useEffect(() => {
        loadTabData();
    }, [activeTab, filter]);

    const loadTabData = async () => {
        setLoading(true);
        try {
            if (activeTab === 'reports') {
                const res = await adminApi.getReports(filter);
                setReports(res.data.reports || []);
            } else if (activeTab === 'orgs') {
                const res = await adminApi.getOrgRequests(filter === 'all' ? 'pending' : filter);
                setOrgs(res.data.organizations || []);
            } else if (activeTab === 'vectors') {
                const res = await adminApi.getVectorStats();
                setVectorStats(res.data);
            }
        } catch (err) {
            console.error('Admin data load failed:', err);
        }
        setLoading(false);
    };

    const handleConfirmScam = async (reportId) => {
        try {
            await adminApi.confirmScam(reportId);
            showToastMsg('Report confirmed & added to vector database');
            loadTabData();
        } catch (err) {
            showToastMsg('Failed to confirm report');
        }
    };

    const handleDismiss = async (reportId) => {
        try {
            await adminApi.dismissReport(reportId);
            showToastMsg('Report dismissed');
            loadTabData();
        } catch (err) {
            showToastMsg('Failed to dismiss');
        }
    };

    const handleApproveOrg = async (orgId) => {
        try {
            await adminApi.approveOrg(orgId);
            showToastMsg('Organization approved');
            loadTabData();
        } catch (err) {
            showToastMsg('Failed to approve');
        }
    };

    const handleRejectOrg = async (orgId) => {
        if (!rejectNote || rejectNote.length < 5) {
            showToastMsg('Rejection reason is mandatory (min 5 characters)');
            return;
        }
        try {
            await adminApi.rejectOrg(orgId, rejectNote);
            showToastMsg('Organization rejected');
            setShowReject(null);
            setRejectNote('');
            loadTabData();
        } catch (err) {
            showToastMsg('Failed to reject');
        }
    };

    const handleDeleteVector = async (chromaId) => {
        try {
            await adminApi.deleteVector(chromaId);
            showToastMsg('Vector deleted');
            loadTabData();
        } catch (err) {
            showToastMsg('Failed to delete');
        }
    };

    const showToastMsg = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(''), 3000);
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'pending': return 'bg-amber-500/20 text-amber-400';
            case 'confirmed': return 'bg-green-500/20 text-green-400';
            case 'false_positive': return 'bg-gray-500/20 text-gray-400';
            default: return 'bg-gray-500/20 text-gray-400';
        }
    };

    const TABS = [
        { id: 'reports', label: 'Reported Messages', icon: '📋' },
        { id: 'orgs', label: 'Organizations', icon: '🏢' },
        { id: 'vectors', label: 'Vector DB', icon: '🧠' },
    ];

    return (
        <div className="min-h-screen bg-navy-900">
            {/* Top Bar */}
            <div className="sticky top-0 z-50 bg-navy-800/90 backdrop-blur-xl border-b border-white/5">
                <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
                    <button onClick={() => navigate('/home')} className="text-gray-400 hover:text-white transition-colors">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <h1 className="text-lg font-bold text-white">Admin Dashboard</h1>
                    <div className="w-6" />
                </div>

                {/* Tab Bar */}
                <div className="max-w-5xl mx-auto px-4">
                    <div className="flex gap-1 overflow-x-auto pb-0">
                        {TABS.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => { setActiveTab(tab.id); setFilter('all'); }}
                                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-all whitespace-nowrap ${activeTab === tab.id
                                        ? 'bg-navy-900 text-indigo-400 border-b-2 border-indigo-400'
                                        : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                <span>{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 py-6">
                {/* ── Tab 1: Reports ── */}
                {activeTab === 'reports' && (
                    <div>
                        <div className="flex gap-2 mb-4">
                            {['all', 'pending', 'confirmed', 'false_positive'].map((f) => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${filter === f
                                            ? 'bg-indigo-500 text-white'
                                            : 'bg-navy-800 text-gray-400 hover:text-white'
                                        }`}
                                >
                                    {f === 'false_positive' ? 'Dismissed' : f}
                                </button>
                            ))}
                        </div>

                        {loading ? (
                            <div className="flex justify-center py-10">
                                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : reports.length === 0 ? (
                            <div className="text-center py-16 text-gray-500">No reports found</div>
                        ) : (
                            <div className="space-y-3">
                                {reports.map((report) => (
                                    <div key={report.id} className="bg-navy-800 rounded-xl border border-white/5 p-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white text-sm mb-2 break-words">
                                                    "{report.messageContent}"
                                                </p>
                                                <div className="flex items-center gap-3 text-xs text-gray-500">
                                                    <span>Reporter: {report.reportedBy?.slice(0, 8)}...</span>
                                                    <span>{report.reportedAt ? new Date(report.reportedAt).toLocaleDateString() : ''}</span>
                                                    <span className={`px-2 py-0.5 rounded-full ${getStatusBadge(report.status)}`}>
                                                        {report.status}
                                                    </span>
                                                </div>
                                            </div>
                                            {report.status === 'pending' && (
                                                <div className="flex gap-2 flex-shrink-0">
                                                    <button
                                                        onClick={() => handleConfirmScam(report.id)}
                                                        className="px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-medium hover:bg-red-500/30 transition-all"
                                                    >
                                                        Confirm Scam
                                                    </button>
                                                    <button
                                                        onClick={() => handleDismiss(report.id)}
                                                        className="px-3 py-1.5 bg-navy-700 text-gray-400 rounded-lg text-xs font-medium hover:bg-navy-600 transition-all"
                                                    >
                                                        Dismiss
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Tab 2: Organizations ── */}
                {activeTab === 'orgs' && (
                    <div>
                        {loading ? (
                            <div className="flex justify-center py-10">
                                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : orgs.length === 0 ? (
                            <div className="text-center py-16 text-gray-500">No pending organization requests</div>
                        ) : (
                            <div className="space-y-3">
                                {orgs.map((org) => (
                                    <div key={org.uid} className="bg-navy-800 rounded-xl border border-white/5 p-4">
                                        <div className="flex items-start gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-navy-700 flex items-center justify-center flex-shrink-0">
                                                {org.logoUrl ? (
                                                    <img src={org.logoUrl} alt={org.name} className="w-10 h-10 rounded-lg object-cover" />
                                                ) : (
                                                    <span className="text-lg">🏢</span>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-white font-semibold">{org.name}</h3>
                                                <div className="flex flex-col gap-1 mt-1 text-xs text-gray-400">
                                                    <span>Reg: {org.regNumber}</span>
                                                    <a href={org.website} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline truncate">
                                                        {org.website}
                                                    </a>
                                                </div>
                                            </div>
                                            {!org.verified && (
                                                <div className="flex gap-2 flex-shrink-0">
                                                    <button
                                                        onClick={() => handleApproveOrg(org.uid)}
                                                        className="px-3 py-1.5 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg text-xs font-medium hover:bg-green-500/30 transition-all"
                                                    >
                                                        Approve
                                                    </button>
                                                    <button
                                                        onClick={() => setShowReject(org.uid)}
                                                        className="px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-medium hover:bg-red-500/30 transition-all"
                                                    >
                                                        Reject
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Reject modal inline */}
                                        {showReject === org.uid && (
                                            <div className="mt-3 pt-3 border-t border-white/5 animate-fade-in">
                                                <textarea
                                                    value={rejectNote}
                                                    onChange={(e) => setRejectNote(e.target.value)}
                                                    placeholder="Reason for rejection (mandatory, min 5 chars)"
                                                    className="w-full bg-navy-700 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                                                    rows={2}
                                                />
                                                <div className="flex gap-2 mt-2">
                                                    <button
                                                        onClick={() => handleRejectOrg(org.uid)}
                                                        className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold"
                                                    >
                                                        Confirm Reject
                                                    </button>
                                                    <button
                                                        onClick={() => { setShowReject(null); setRejectNote(''); }}
                                                        className="px-3 py-1.5 bg-navy-700 text-gray-400 rounded-lg text-xs"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Tab 3: Vector DB Stats ── */}
                {activeTab === 'vectors' && (
                    <div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                            <div className="bg-navy-800 rounded-xl border border-white/5 p-5">
                                <p className="text-gray-400 text-sm">Total Vectors</p>
                                <p className="text-3xl font-bold text-indigo-400 mt-1">{vectorStats.total_vectors}</p>
                            </div>
                            <div className="bg-navy-800 rounded-xl border border-white/5 p-5">
                                <p className="text-gray-400 text-sm">Collection</p>
                                <p className="text-lg font-bold text-white mt-1">scam_vectors</p>
                                <p className="text-xs text-gray-500">ChromaDB in-process</p>
                            </div>
                        </div>

                        <h3 className="text-white font-semibold mb-3">Recent Scam Patterns</h3>
                        {loading ? (
                            <div className="flex justify-center py-10">
                                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : vectorStats.recent_patterns?.length === 0 ? (
                            <div className="text-center py-10 text-gray-500">No vectors in database yet</div>
                        ) : (
                            <div className="space-y-2">
                                {vectorStats.recent_patterns?.map((pattern, i) => (
                                    <div key={i} className="bg-navy-800 rounded-xl border border-white/5 px-4 py-3 flex items-center justify-between">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white text-sm truncate">{pattern.text}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">ID: {pattern.id}</p>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteVector(pattern.id)}
                                            className="ml-3 px-3 py-1 text-red-400 text-xs font-medium hover:bg-red-500/10 rounded-lg transition-all flex-shrink-0"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Toast */}
            {toast && (
                <div className="fixed top-20 left-1/2 -translate-x-1/2 z-70 bg-navy-700 border border-white/10 text-white px-6 py-3 rounded-xl shadow-2xl animate-slide-down">
                    {toast}
                </div>
            )}
        </div>
    );
}
