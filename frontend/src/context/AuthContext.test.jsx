import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import axios from 'axios';
import { AuthProvider, useAuth } from './AuthContext';

const Consumer = () => {
  const { user, authStatus, loading, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="status">{authStatus}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="name">{user?.name || 'none'}</span>
      <button onClick={() => login('a@b.c', 'secret1')} data-testid="login">
        login
      </button>
      <button onClick={logout} data-testid="logout">
        logout
      </button>
    </div>
  );
};

const renderAuth = () =>
  render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>
  );

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is unauthenticated when refresh fails', async () => {
    const error = new Error('Unauthorized');
    error.response = { status: 401 };
    axios.post.mockRejectedValue(error);
    renderAuth();

    expect(await screen.findByTestId('status')).toHaveTextContent('unauthenticated');
  });

  it('authenticates after a successful login', async () => {
    axios.post.mockImplementation((url) => {
      if (url === '/api/auth/refresh') {
        const error = new Error('No token');
        error.response = { status: 401 };
        return Promise.reject(error);
      }
      if (url === '/api/auth/login') return Promise.resolve({ data: { data: { user: { name: 'Ada' }, token: 'tok-1' } } });
      return Promise.reject(new Error(`Unhandled POST ${url}`));
    });

    renderAuth();
    await screen.findByTestId('login');
    // Wait for the initial auth check to settle.
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));

    fireEvent.click(screen.getByTestId('login'));

    await waitFor(() => {
      expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    });
    expect(screen.getByTestId('name')).toHaveTextContent('Ada');
    expect(axios.defaults.headers.common.Authorization).toBe('Bearer tok-1');
  });

  it('logs the user out and clears the token', async () => {
    axios.post.mockImplementation((url) => {
      if (url === '/api/auth/refresh') return Promise.resolve({ data: { data: { token: 'tok-x' } } });
      if (url === '/api/auth/logout') return Promise.resolve({});
      return Promise.reject(new Error(`Unhandled POST ${url}`));
    });
    axios.get.mockImplementation((url) => {
      if (url === '/api/auth/me') return Promise.resolve({ data: { data: { user: { name: 'Ada' } } } });
      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });

    renderAuth();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    fireEvent.click(screen.getByTestId('logout'));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    expect(axios.defaults.headers.common.Authorization).toBeUndefined();
  });
});
