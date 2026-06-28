/**
 * Auth Page — Premium 4-step signup + login flow.
 * Deep navy (#0F172A) with indigo (#6366F1) accents.
 */
import React, { useState, useRef, useEffect } from 'react';
import { sendOtp, verifyOtp } from '../../services/firebase';
import { authApi } from '../../services/api';
import { sha256Hash } from '../../services/encryption';
import { useAuth } from '../../contexts/AuthContext';

const COUNTRY_CODES = [
    { code: '+91', flag: '🇮🇳', name: 'India' },
    { code: '+1', flag: '🇺🇸', name: 'USA' },
    { code: '+44', flag: '🇬🇧', name: 'UK' },
    { code: '+61', flag: '🇦🇺', name: 'Australia' },
    { code: '+81', flag: '🇯🇵', name: 'Japan' },
];

export default function AuthPage() {
    const { refreshProfile, beginSignup } = useAuth();
    const [mode, setMode] = useState('login'); // 'login' | 'signup'
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Step 1 — Phone
    const [countryCode, setCountryCode] = useState('+91');
    const [phone, setPhone] = useState('');

    // Step 2 — OTP
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [countdown, setCountdown] = useState(60);
    const [canResend, setCanResend] = useState(false);
    const otpRefs = useRef([]);

    // Step 3 — Profile
    const [displayName, setDisplayName] = useState('');
    const [gender, setGender] = useState('');
    const [age, setAge] = useState('');

    // Step 4 — Emergency Contact
    const [emergencyName, setEmergencyName] = useState('');
    const [emergencyPhone, setEmergencyPhone] = useState('');

    // Age gate
    const [ageBlocked, setAgeBlocked] = useState(false);

    // Countdown timer for OTP
    useEffect(() => {
        let timer;
        if (step === 2 && countdown > 0) {
            timer = setInterval(() => setCountdown((c) => c - 1), 1000);
        }
        if (countdown === 0) setCanResend(true);
        return () => clearInterval(timer);
    }, [step, countdown]);

    // ── Step 1: Send OTP ──
    const handleSendOtp = async () => {
        if (!phone || phone.length < 10) {
            setError('Please enter a valid phone number');
            return;
        }
        setLoading(true);
        setError('');
        try {
            await sendOtp(`${countryCode}${phone}`);
            setStep(2);
            setCountdown(60);
            setCanResend(false);
        } catch (err) {
            const detail = err.response?.data?.detail || err.message || 'Failed to send OTP';
            setError(detail);
        }
        setLoading(false);
    };

    // ── Step 2: Verify OTP ──
    const handleVerifyOtp = async () => {
        const code = otp.join('');
        if (code.length !== 6) {
            setError('Please enter the complete OTP');
            return;
        }
        setLoading(true);
        setError('');
        try {
            // For signup mode: tell the context not to fetch the (non-existent)
            // profile when the token lands, so the signup steps aren't reset.
            if (mode === 'signup') beginSignup();

            // Pass the full phone number so the backend can match it
            await verifyOtp(`${countryCode}${phone}`, code);

            if (mode === 'login') {
                try {
                    await refreshProfile();
                    // refreshProfile success → existing user → AuthContext will
                    // redirect to /home via App.jsx
                } catch (profileErr) {
                    // 404 → token valid but no profile yet → treat as new user
                    if (profileErr.response?.status === 404) {
                        beginSignup(); // block context from interfering
                        setMode('signup');
                        setStep(3);
                        setError('');
                    } else {
                        setError('Login failed. Please try again.');
                    }
                }
            } else {
                // signup mode → continue to profile step
                setStep(3);
            }
        } catch (err) {
            const detail = err.response?.data?.detail || 'Invalid OTP. Please try again.';
            setError(detail);
        }
        setLoading(false);
    };

    const handleOtpChange = (index, value) => {
        if (!/^\d?$/.test(value)) return;
        const newOtp = [...otp];
        newOtp[index] = value;
        setOtp(newOtp);
        // Auto-advance
        if (value && index < 5) {
            otpRefs.current[index + 1]?.focus();
        }
    };

    const handleOtpKeyDown = (index, e) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            otpRefs.current[index - 1]?.focus();
        }
    };

    // ── Step 3: Profile ──
    const handleProfileContinue = () => {
        const ageNum = parseInt(age);
        if (ageNum < 13) {
            setAgeBlocked(true);
            return;
        }
        if (!displayName || !gender || !age) {
            setError('Please fill in all fields');
            return;
        }
        setError('');
        setStep(4);
    };

    // ── Step 4: Emergency Contact → Complete Registration ──
    const handleCompleteRegistration = async () => {
        if (!emergencyName || !emergencyPhone) {
            setError('Emergency contact is mandatory for your safety');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const phoneHash = sha256Hash(`${countryCode}${phone}`);
            await authApi.register({
                displayName,
                phoneHash,
                gender,
                age: parseInt(age),
                emergencyContactName: emergencyName,
                emergencyContactPhone: emergencyPhone,
            });
            await refreshProfile();
        } catch (err) {
            setError(err.response?.data?.detail || 'Registration failed');
        }
        setLoading(false);
    };

    // ── Age Block Screen ──
    if (ageBlocked) {
        return (
            <div className="min-h-screen bg-navy-900 flex items-center justify-center p-4">
                <div className="text-center max-w-md">
                    <div className="text-6xl mb-6">🚫</div>
                    <h1 className="text-3xl font-bold text-white mb-4">Access Denied</h1>
                    <p className="text-gray-400 text-lg">
                        Prism is not available for users under 13.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-navy-900 flex flex-col items-center justify-center p-4">
            {/* Prism Branding */}
            <div className="text-center mb-8 animate-fade-in">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 mb-4 animate-glow">
                    <span className="text-4xl">🔮</span>
                </div>
                <h1 className="text-4xl font-extrabold text-white tracking-tight">
                    Prism
                </h1>
                <p className="text-indigo-400 text-lg mt-1 font-medium">
                    Reveal the hidden intent.
                </p>
            </div>

            {/* Auth Card */}
            <div className="w-full max-w-md bg-navy-800/80 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl p-8 animate-slide-up">
                {/* Mode Toggle — only on step 1 */}
                {step === 1 && (
                    <div className="flex bg-navy-900 rounded-xl p-1 mb-8">
                        <button
                            onClick={() => setMode('login')}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${mode === 'login'
                                ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                                : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            Login
                        </button>
                        <button
                            onClick={() => setMode('signup')}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-300 ${mode === 'signup'
                                ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                                : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            Sign Up
                        </button>
                    </div>
                )}

                {/* Progress Steps (signup only) */}
                {mode === 'signup' && step > 1 && (
                    <div className="flex items-center justify-center gap-2 mb-8">
                        {[1, 2, 3, 4].map((s) => (
                            <div
                                key={s}
                                className={`h-2 rounded-full transition-all duration-500 ${s <= step
                                    ? 'w-8 bg-indigo-500'
                                    : 'w-2 bg-navy-600'
                                    }`}
                            />
                        ))}
                    </div>
                )}

                {/* ── Step 1: Phone Number ── */}
                {step === 1 && (
                    <div className="space-y-6 animate-fade-in">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Phone Number
                            </label>
                            <div className="flex gap-2">
                                <select
                                    value={countryCode}
                                    onChange={(e) => setCountryCode(e.target.value)}
                                    className="bg-navy-700 border border-white/10 rounded-xl px-3 py-3.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    {COUNTRY_CODES.map((c) => (
                                        <option key={c.code} value={c.code}>
                                            {c.flag} {c.code}
                                        </option>
                                    ))}
                                </select>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                                    placeholder="Enter phone number"
                                    maxLength={10}
                                    className="flex-1 bg-navy-700 border border-white/10 rounded-xl px-4 py-3.5 text-white text-lg placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleSendOtp}
                            disabled={loading || phone.length < 10}
                            className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <span className="inline-flex items-center gap-2">
                                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    Sending...
                                </span>
                            ) : (
                                'Send OTP'
                            )}
                        </button>

                        <p className="text-xs text-gray-500 text-center leading-relaxed">
                            Your number is used only for verification. It is never shared or stored in plaintext.
                        </p>

                        {/* Organization Registration Link */}
                        <div className="pt-2 border-t border-white/5">
                            <button
                                onClick={() => window.location.href = '/org-register'}
                                className="w-full text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
                            >
                                Register as Organization →
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Step 2: OTP Verification ── */}
                {step === 2 && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="text-center">
                            <h2 className="text-xl font-bold text-white mb-1">Verify OTP</h2>
                            <p className="text-sm text-gray-400">
                                Enter the 6-digit code sent to {countryCode}{phone}
                            </p>
                        </div>

                        <div className="flex justify-center gap-3">
                            {otp.map((digit, i) => (
                                <input
                                    key={i}
                                    ref={(el) => (otpRefs.current[i] = el)}
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={1}
                                    value={digit}
                                    onChange={(e) => handleOtpChange(i, e.target.value)}
                                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                                    className="w-12 h-14 text-center text-2xl font-bold bg-navy-700 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                />
                            ))}
                        </div>

                        <button
                            onClick={handleVerifyOtp}
                            disabled={loading || otp.join('').length !== 6}
                            className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/30 transition-all disabled:opacity-50"
                        >
                            {loading ? 'Verifying...' : 'Verify'}
                        </button>

                        <div className="text-center">
                            {canResend ? (
                                <button
                                    onClick={() => {
                                        setCountdown(60);
                                        setCanResend(false);
                                        handleSendOtp();
                                    }}
                                    className="text-indigo-400 hover:text-indigo-300 text-sm font-medium"
                                >
                                    Resend OTP
                                </button>
                            ) : (
                                <p className="text-gray-500 text-sm">
                                    Resend OTP in <span className="text-indigo-400 font-semibold">{countdown}s</span>
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Step 3: Profile Setup ── */}
                {step === 3 && mode === 'signup' && (
                    <div className="space-y-5 animate-fade-in">
                        <div className="text-center mb-2">
                            <h2 className="text-xl font-bold text-white">Profile Setup</h2>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Display Name
                            </label>
                            <input
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="Enter your name"
                                className="w-full bg-navy-700 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Gender</label>
                            <div className="flex gap-2">
                                {[
                                    { val: 'male', label: 'Male' },
                                    { val: 'female', label: 'Female' },
                                    { val: 'prefer_not_to_say', label: 'Prefer not to say' },
                                ].map((g) => (
                                    <button
                                        key={g.val}
                                        onClick={() => setGender(g.val)}
                                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ${gender === g.val
                                            ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
                                            : 'bg-navy-700 text-gray-400 border border-white/10 hover:border-indigo-500/50'
                                            }`}
                                    >
                                        {g.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Age</label>
                            <input
                                type="number"
                                value={age}
                                onChange={(e) => setAge(e.target.value)}
                                placeholder="Enter your age"
                                min={1}
                                max={120}
                                className="w-full bg-navy-700 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        <button
                            onClick={handleProfileContinue}
                            disabled={!displayName || !gender || !age}
                            className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/30 transition-all disabled:opacity-50"
                        >
                            Continue
                        </button>
                    </div>
                )}

                {/* ── Step 4: Emergency Contact ── */}
                {step === 4 && mode === 'signup' && (
                    <div className="space-y-5 animate-fade-in">
                        <div className="text-center mb-2">
                            <h2 className="text-xl font-bold text-white">Emergency Contact</h2>
                            <p className="text-sm text-amber-400 mt-1">⚠ For your safety — mandatory</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Full Name</label>
                            <input
                                type="text"
                                value={emergencyName}
                                onChange={(e) => setEmergencyName(e.target.value)}
                                placeholder="Emergency contact's full name"
                                className="w-full bg-navy-700 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Phone Number</label>
                            <input
                                type="tel"
                                value={emergencyPhone}
                                onChange={(e) => setEmergencyPhone(e.target.value.replace(/\D/g, ''))}
                                placeholder="Emergency contact's phone"
                                className="w-full bg-navy-700 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        <p className="text-xs text-gray-500 text-center">
                            This phone number is stored for SOS purposes only and never shown in any UI.
                        </p>

                        <button
                            onClick={handleCompleteRegistration}
                            disabled={loading || !emergencyName || !emergencyPhone}
                            className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-500/30 transition-all disabled:opacity-50"
                        >
                            {loading ? 'Creating Account...' : 'Complete Signup'}
                        </button>
                    </div>
                )}

                {/* Error Display */}
                {error && (
                    <div className="mt-4 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 animate-fade-in">
                        <p className="text-red-400 text-sm text-center">{error}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
