import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);
const AUTH_STATUS = {
  LOADING: 'loading',
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
  UNAVAILABLE: 'unavailable',
};

axios.defaults.withCredentials = true;

const setAuthorizationHeader = (authToken) => {
  if (authToken) axios.defaults.headers.common.Authorization = `Bearer ${authToken}`;
  else delete axios.defaults.headers.common.Authorization;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [authStatus, setAuthStatus] = useState(AUTH_STATUS.LOADING);
  const [authError, setAuthError] = useState('');
  const refreshingRef = useRef(null);

  const persistAccessToken = (authToken) => {
    setToken(authToken || null);
    setAuthorizationHeader(authToken || null);
  };

  const refreshAccessToken = async () => {
    if (!refreshingRef.current) {
      refreshingRef.current = axios
        .post('/api/auth/refresh', null, { withCredentials: true })
        .then((response) => {
          const nextToken = response.data.data.token;
          persistAccessToken(nextToken);
          return nextToken;
        })
        .finally(() => {
          refreshingRef.current = null;
        });
    }
    return refreshingRef.current;
  };

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      setAuthStatus(AUTH_STATUS.LOADING);
      try {
        const nextToken = await refreshAccessToken();
        if (cancelled) return;
        const response = await axios.get('/api/auth/me');
        if (cancelled) return;
        setUser(response.data.data.user);
        setAuthStatus(AUTH_STATUS.AUTHENTICATED);
        setAuthError('');
        persistAccessToken(nextToken);
      } catch (error) {
        if (cancelled) return;
        persistAccessToken(null);
        setUser(null);
        setAuthStatus(error.response?.status === 401 ? AUTH_STATUS.UNAUTHENTICATED : AUTH_STATUS.UNAVAILABLE);
        setAuthError(error.response?.status === 401 ? '' : 'We could not verify your session. Please try again.');
      }
    };
    bootstrap();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;
        if (
          error.response?.status !== 401 ||
          originalRequest?._retry ||
          originalRequest?.url?.includes('/api/auth/')
        ) return Promise.reject(error);

        originalRequest._retry = true;
        try {
          const nextToken = await refreshAccessToken();
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${nextToken}`;
          return axios(originalRequest);
        } catch (refreshError) {
          persistAccessToken(null);
          setUser(null);
          setAuthStatus(AUTH_STATUS.UNAUTHENTICATED);
          return Promise.reject(refreshError);
        }
      }
    );
    return () => axios.interceptors.response.eject(interceptorId);
  }, []);

  const authenticate = async (endpoint, payload) => {
    const response = await axios.post(endpoint, payload, { withCredentials: true });
    const { user: userData, token: accessToken } = response.data.data;
    persistAccessToken(accessToken);
    setUser(userData);
    setAuthStatus(AUTH_STATUS.AUTHENTICATED);
    setAuthError('');
    return response.data;
  };

  const login = (email, password) => authenticate('/api/auth/login', { email, password });
  const register = (name, email, password) => authenticate('/api/auth/register', { name, email, password });

  const logout = async () => {
    try {
      await axios.post('/api/auth/logout', null, { withCredentials: true });
    } catch {
      // Local logout still completes if the network is unavailable.
    } finally {
      persistAccessToken(null);
      setUser(null);
      setAuthStatus(AUTH_STATUS.UNAUTHENTICATED);
      setAuthError('');
    }
  };

  const logoutAll = async () => {
    await axios.post('/api/auth/logout-all');
    persistAccessToken(null);
    setUser(null);
    setAuthStatus(AUTH_STATUS.UNAUTHENTICATED);
  };

  const refreshUser = async () => {
    try {
      const nextToken = await refreshAccessToken();
      const response = await axios.get('/api/auth/me', { headers: { Authorization: `Bearer ${nextToken}` } });
      setUser(response.data.data.user);
      setAuthStatus(AUTH_STATUS.AUTHENTICATED);
      setAuthError('');
    } catch {
      persistAccessToken(null);
      setUser(null);
      setAuthStatus(AUTH_STATUS.UNAUTHENTICATED);
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
    logoutAll,
    refreshUser,
    refreshAccessToken,
    isAuthenticated: Boolean(token),
    isUserLoaded: Boolean(user),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
