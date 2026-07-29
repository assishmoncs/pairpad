import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Login from '../pages/Login';
import Register from '../pages/Register';
import Dashboard from '../pages/Dashboard';
import Room from '../pages/Room';

const FullPageState = ({ title, children }) => (
  <div className="app-state">
    <div className="app-state-panel">
      <h1>{title}</h1>
      {children}
    </div>
  </div>
);

const SessionUnavailable = () => {
  const { authError, refreshUser, logout } = useAuth();

  return (
    <FullPageState title="Session temporarily unavailable">
      <p>{authError || 'We could not load your account right now.'}</p>
      <div className="app-state-actions">
        <button type="button" onClick={refreshUser} className="btn-primary">
          Try again
        </button>
        <button type="button" onClick={logout} className="btn-secondary">
          Logout
        </button>
      </div>
    </FullPageState>
  );
};

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isUserLoaded, authStatus, loading } = useAuth();

  if (loading) {
    return (
      <FullPageState title="Loading">
        <p>Checking your session...</p>
      </FullPageState>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (authStatus === 'unavailable') {
    return <SessionUnavailable />;
  }

  if (!isUserLoaded) {
    return (
      <FullPageState title="Loading">
        <p>Loading your account...</p>
      </FullPageState>
    );
  }

  return children;
};

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/room/:roomCode"
        element={
          <ProtectedRoute>
            <Room />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

export default AppRoutes;
