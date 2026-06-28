/**
 * Organization Registration Page — public page for org sign-up.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { orgApi } from '../../services/api';

export default function OrgRegister() {
    const navigate = useNavigate();
    const [form, setForm] = useState({
        name: '',
        regNumber: '',
        website: '',
        adminContactPhone: '',
    });
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        if (!form.name || !form.regNumber || !form.website || !form.adminContactPhone) {
            setError('All fields are required');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await orgApi.register(form);
            setSuccess(true);
        } catch (err) {
            setError(err.response?.data?.detail || 'Registration failed');
        }
        setLoading(false);
    };

    const update = (key, val) => setForm({ ...form, [key]: val });

    if (success) {
        return (
            <div className="min-h-screen bg-navy-900 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-navy-800 rounded-2xl border border-white/10 p-8 text-center animate-fade-in">
                    <div className="text-5xl mb-4">✅</div>
                    <h1 className="text-2xl font-bold text-white mb-2">Registration Submitted</h1>
                    <p className="text-gray-400 mb-6">
                        Your organization is pending admin verification. You will be notified once approved.
                    </p>
                    <button
                        onClick={() => navigate('/')}
                        className="px-6 py-3 bg-indigo-500 text-white rounded-xl font-semibold hover:bg-indigo-600 transition-all"
                    >
                        Back to Login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-navy-900 flex flex-col items-center justify-center p-4">
            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-4">
                    <span className="text-3xl">🏢</span>
                </div>
                <h1 className="text-3xl font-bold text-white">Register Organization</h1>
                <p className="text-gray-400 mt-1">Get verified and build trust with your users.</p>
            </div>

            <div className="w-full max-w-md bg-navy-800/80 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl p-8">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Organization Name</label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={(e) => update('name', e.target.value)}
                            placeholder="e.g. HDFC Bank"
                            className="w-full bg-navy-700 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Registration Number (CIN / GST)</label>
                        <input
                            type="text"
                            value={form.regNumber}
                            onChange={(e) => update('regNumber', e.target.value)}
                            placeholder="e.g. U65120MH2000PLC123456"
                            className="w-full bg-navy-700 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Official Website</label>
                        <input
                            type="url"
                            value={form.website}
                            onChange={(e) => update('website', e.target.value)}
                            placeholder="https://www.example.com"
                            className="w-full bg-navy-700 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Admin Contact Phone</label>
                        <input
                            type="tel"
                            value={form.adminContactPhone}
                            onChange={(e) => update('adminContactPhone', e.target.value)}
                            placeholder="+91 98765 43210"
                            className="w-full bg-navy-700 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/30 transition-all disabled:opacity-50 mt-2"
                    >
                        {loading ? 'Submitting...' : 'Submit for Verification'}
                    </button>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                            <p className="text-red-400 text-sm text-center">{error}</p>
                        </div>
                    )}
                </div>

                <div className="mt-6 pt-4 border-t border-white/5 text-center">
                    <button
                        onClick={() => navigate('/')}
                        className="text-indigo-400 hover:text-indigo-300 text-sm"
                    >
                        ← Back to Login
                    </button>
                </div>
            </div>
        </div>
    );
}
