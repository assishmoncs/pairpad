import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);
const AUTH_STATUS = {
  LOADING: 'loading',
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
  UNAVAILABLE: 'unavailable',
};

const getStoredToken = () => localStorage.getItem('token');

const setAuthorizationHeader = (authToken) => {
  if (authToken) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
  } else {
    delete axios.defaults.headers.common['Authorization'];
  }
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(getStoredToken);
  const [authStatus, setAuthStatus] = useState(
    token ? AUTH_STATUS.LOADING : AUTH_STATUS.UNAUTHENTICATED
  );
  const [authError, setAuthError] = useState('');
  const [refreshCount, setRefreshCount] = useState(0);

  const persistToken = (authToken) => {
    if (authToken) {
      localStorage.setItem('token', authToken);
    } else {
      localStorage.removeItem('token');
    }

    setAuthorizationHeader(authToken);
    setToken(authToken);
  };

  useEffect(() => {
    setAuthorizationHeader(token);

    let cancelled = false;

    const checkAuth = async () => {
      if (!token) {
        setUser(null);
        setAuthError('');
        setAuthStatus(AUTH_STATUS.UNAUTHENTICATED);
        return;
      }

      setAuthStatus(AUTH_STATUS.LOADING);
      setAuthError('');

      try {
        const response = await axios.get('/api/auth/me');
        if (cancelled) return;

        setUser(response.data.data.user);
        setAuthStatus(AUTH_STATUS.AUTHENTICATED);
      } catch (error) {
        if (cancelled) return;

        console.error('Auth check failed:', error.message);
        const status = error.response?.status;

        if (status === 401 || status === 403) {
          persistToken(null);
          setUser(null);
          setAuthStatus(AUTH_STATUS.UNAUTHENTICATED);
          setAuthError('');
          return;
        }

        setAuthStatus(AUTH_STATUS.UNAVAILABLE);
        setAuthError('We could not verify your session. Please try again.');
      } finally {
        // Auth status carries the loading state.
      }
    };

    checkAuth();

    return () => {
      cancelled = true;
    };
  }, [token, refreshCount]);

  const authenticate = async (endpoint, payload) => {
    const response = await axios.post(endpoint, payload);
    const { user: userData, token: authToken } = response.data.data;

    persistToken(authToken);
    setUser(userData);
    setAuthStatus(AUTH_STATUS.AUTHENTICATED);
    setAuthError('');

    return response.data;
  };

  const login = (email, password) =>
    authenticate('/api/auth/login', { email, password });

  const register = (name, email, password) =>
    authenticate('/api/auth/register', { name, email, password });

  const logout = () => {
    persistToken(null);
    setUser(null);
    setAuthStatus(AUTH_STATUS.UNAUTHENTICATED);
    setAuthError('');
  };

  const refreshUser = () => {
    if (token) {
      setRefreshCount((count) => count + 1);
    }
  };

  const value = {
    user,
    token,
    authStatus,
    authError,
    loading: authStatus === AUTH_STATUS.LOADING,
    login,
    register,
    logout,
    refreshUser,
    isAuthenticated: !!token,
    isUserLoaded: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
