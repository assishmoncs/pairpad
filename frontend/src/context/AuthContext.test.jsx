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
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('is unauthenticated when there is no stored token', async () => {
    renderAuth();

    expect(await screen.findByTestId('status')).toHaveTextContent('unauthenticated');
  });

  it('authenticates after a successful login', async () => {
    axios.post.mockResolvedValue({
      data: { data: { user: { name: 'Ada' }, token: 'tok-1' } },
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
    expect(localStorage.getItem('token')).toBe('tok-1');
  });

  it('logs the user out and clears the token', async () => {
    localStorage.setItem('token', 'tok-x');
    axios.get.mockResolvedValue({
      data: { data: { user: { name: 'Ada' } } },
    });

    renderAuth();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    fireEvent.click(screen.getByTestId('logout'));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    expect(localStorage.getItem('token')).toBeNull();
  });
});
