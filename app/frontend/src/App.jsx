/**
 * App.jsx — Root component with React Router and auth gating.
 */
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AuthPage from './pages/Auth/AuthPage';
import HomePage from './pages/Home/HomePage';
import ChatList from './pages/Chat/ChatList';
import ActiveChat from './pages/Chat/ActiveChat';
import ProfilePage from './pages/Profile/ProfilePage';
import SettingsPage from './pages/Settings/SettingsPage';
import AdminDashboard from './pages/Admin/AdminDashboard';
import OrgRegister from './pages/OrgRegister/OrgRegister';

function ProtectedRoute({ children }) {
    const { firebaseUser, isRegistered, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-navy-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4 animate-glow">
                        <span className="text-3xl">🔮</span>
                    </div>
                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mt-4" />
                    <p className="text-gray-400 mt-3 text-sm">Loading Prism...</p>
                </div>
            </div>
        );
    }

    if (!firebaseUser || !isRegistered) {
        return <Navigate to="/" replace />;
    }

    return children;
}

function AppRoutes() {
    const { firebaseUser, isRegistered, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-navy-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4 animate-glow">
                        <span className="text-3xl">🔮</span>
                    </div>
                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mt-4" />
                </div>
            </div>
        );
    }

    return (
        <Routes>
            {/* Public routes */}
            <Route
                path="/"
                element={
                    firebaseUser && isRegistered ? <Navigate to="/home" replace /> : <AuthPage />
                }
            />
            <Route path="/org-register" element={<OrgRegister />} />

            {/* Protected routes */}
            <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
            <Route path="/chats" element={<ProtectedRoute><ChatList /></ProtectedRoute>} />
            <Route path="/chat/:chatId" element={<ProtectedRoute><ActiveChat /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <AppRoutes />
            </AuthProvider>
        </BrowserRouter>
    );
}
