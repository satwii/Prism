/**
 * Auth Context — manages user authentication state across the app.
 * JWT token is kept in sessionStorage (set by our custom auth service).
 *
 * Key design: onAuthChange fires when a token exists. We only mark
 * isRegistered=true after successfully fetching the profile. During the
 * signup flow (steps 3-4 in AuthPage) the user has a token but no profile
 * yet — that is a VALID intermediate state, not an error.
 */
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { onAuthChange, logout as authLogout } from '../services/firebase';
import { authApi } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [authUser, setAuthUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    // Start as true so the loading spinner shows before we know the auth state
    const [loading, setLoading] = useState(true);
    const [isRegistered, setIsRegistered] = useState(false);

    // Prevent the onAuthChange callback from firing a profile-fetch
    // while AuthPage is in the middle of the signup registration flow.
    // AuthPage calls refreshProfile() itself once registration is complete.
    const _skipNextProfileFetch = useRef(false);

    useEffect(() => {
        const unsubscribe = onAuthChange(async (user) => {
            setAuthUser(user);

            if (user) {
                if (_skipNextProfileFetch.current) {
                    // Signup in progress — don't clobber the AuthPage flow
                    _skipNextProfileFetch.current = false;
                    setLoading(false);
                    return;
                }
                // Returning user or post-registration — fetch profile
                try {
                    const res = await authApi.getProfile();
                    setUserProfile(res.data);
                    setIsRegistered(true);
                } catch (err) {
                    // 404 = token valid but profile not yet created (new user)
                    // This is normal — AuthPage will handle steps 3-4
                    setUserProfile(null);
                    setIsRegistered(false);
                }
            } else {
                setUserProfile(null);
                setIsRegistered(false);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    /**
     * Called by AuthPage after OTP verify on a NEW user.
     * Prevents onAuthChange from fetching the (non-existent) profile
     * and disrupting the signup flow.
     */
    const beginSignup = () => {
        _skipNextProfileFetch.current = true;
    };

    /**
     * Called after successful registration (step 4 complete).
     * Fetches the profile and marks the user as registered.
     */
    const refreshProfile = async () => {
        try {
            const res = await authApi.getProfile();
            setUserProfile(res.data);
            setIsRegistered(true);
        } catch (err) {
            setUserProfile(null);
            setIsRegistered(false);
            throw err; // Re-throw so caller can handle 404 (new user)
        }
    };

    const logout = async () => {
        await authLogout();
        setAuthUser(null);
        setUserProfile(null);
        setIsRegistered(false);
    };

    const value = {
        authUser,
        firebaseUser: authUser,   // alias for backward compat with existing pages
        userProfile,
        loading,
        isRegistered,
        refreshProfile,
        beginSignup,
        logout,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
