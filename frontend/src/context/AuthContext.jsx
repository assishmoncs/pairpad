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
const getStoredRefreshToken = () => localStorage.getItem('refreshToken');

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

  const persistToken = (authToken, refreshTkn) => {
    if (authToken) {
      localStorage.setItem('token', authToken);
    } else {
      localStorage.removeItem('token');
    }
    if (refreshTkn !== undefined) {
      if (refreshTkn) {
        localStorage.setItem('refreshToken', refreshTkn);
      } else {
        localStorage.removeItem('refreshToken');
      }
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

  // Axios interceptor: auto-refresh on 401
  useEffect(() => {
    let isRefreshing = false;
    let failedQueue = [];

    const processQueue = (error, newToken = null) => {
      failedQueue.forEach(({ resolve, reject }) => {
        if (error) {
          reject(error);
        } else {
          resolve(newToken);
        }
      });
      failedQueue = [];
    };

    if (!axios.interceptors?.response) return;

    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // Only retry once, only on 401, skip auth endpoints
        if (
          error.response?.status !== 401 ||
          originalRequest._retry ||
          originalRequest.url?.includes('/api/auth/')
        ) {
          return Promise.reject(error);
        }

        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject });
          }).then((newToken) => {
            originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
            return axios(originalRequest);
          });
        }

        originalRequest._retry = true;
        isRefreshing = true;

        const storedRefresh = getStoredRefreshToken();
        if (!storedRefresh) {
          isRefreshing = false;
          return Promise.reject(error);
        }

        try {
          const refreshResponse = await axios.post('/api/auth/refresh', {
            refreshToken: storedRefresh,
          });
          const { token: newToken, refreshToken: newRefresh } = refreshResponse.data.data;

          persistToken(newToken, newRefresh);
          processQueue(null, newToken);

          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
          return axios(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError, null);
          // Refresh failed — force logout
          persistToken(null, null);
          setUser(null);
          setAuthStatus(AUTH_STATUS.UNAUTHENTICATED);
          setAuthError('');
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
        }
      }
    );

    return () => {
      if (interceptorId !== undefined) {
        axios.interceptors?.response?.eject?.(interceptorId);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const authenticate = async (endpoint, payload) => {
    const response = await axios.post(endpoint, payload);
    const { user: userData, token: authToken, refreshToken: refreshTkn } = response.data.data;

    persistToken(authToken, refreshTkn);
    setUser(userData);
    setAuthStatus(AUTH_STATUS.AUTHENTICATED);
    setAuthError('');

    return response.data;
  };

  const login = (email, password) => authenticate('/api/auth/login', { email, password });

  const register = (name, email, password) =>
    authenticate('/api/auth/register', { name, email, password });

  const logout = () => {
    persistToken(null, null);
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
