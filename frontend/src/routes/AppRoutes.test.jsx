import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import { AuthProvider } from '../context/AuthContext';
import AppRoutes from './AppRoutes';

const user = {
  _id: 'user-1',
  id: 'user-1',
  name: 'Ada',
  email: 'ada@example.com',
};

const renderApp = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>
  );

describe('AppRoutes auth bootstrap', () => {
  it('keeps the token and shows a retry state when /me is temporarily unavailable', async () => {
    localStorage.setItem('token', 'stored-token');
    let meAttempts = 0;

    axios.get.mockImplementation((url) => {
      if (url === '/api/auth/me') {
        meAttempts += 1;
        if (meAttempts === 1) {
          return Promise.reject(new Error('Network Error'));
        }
        return Promise.resolve({ data: { data: { user } } });
      }

      if (url === '/api/rooms') {
        return Promise.resolve({ data: { data: { rooms: [] } } });
      }

      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });

    renderApp('/dashboard');

    expect(
      await screen.findByRole('heading', { name: /session temporarily unavailable/i })
    ).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBe('stored-token');

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(await screen.findByText(/welcome, ada/i)).toBeInTheDocument();
    expect(meAttempts).toBe(2);
  });

  it('clears the token and redirects to login when /me rejects the token', async () => {
    localStorage.setItem('token', 'bad-token');
    axios.get.mockRejectedValue({
      message: 'Unauthorized',
      response: { status: 401 },
    });

    renderApp('/dashboard');

    expect(await screen.findByRole('heading', { name: /login to pairpad/i })).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBeNull();
  });
});

describe('auth pages', () => {
  it('logs in and navigates to the dashboard using data.token', async () => {
    axios.post.mockResolvedValue({
      data: {
        data: {
          user,
          token: 'login-token',
        },
      },
    });
    axios.get.mockImplementation((url) => {
      if (url === '/api/auth/me') {
        return Promise.resolve({ data: { data: { user } } });
      }

      if (url === '/api/rooms') {
        return Promise.resolve({ data: { data: { rooms: [] } } });
      }

      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });

    renderApp('/login');

    await userEvent.type(screen.getByLabelText(/email/i), user.email);
    await userEvent.type(screen.getByLabelText(/password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith('/api/auth/login', {
        email: user.email,
        password: 'password123',
      });
    });
    expect(await screen.findByText(/welcome, ada/i)).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBe('login-token');
    expect(axios.defaults.headers.common.Authorization).toBe('Bearer login-token');
  });

  it('registers and navigates to the dashboard using data.token', async () => {
    axios.post.mockResolvedValue({
      data: {
        data: {
          user,
          token: 'register-token',
        },
      },
    });
    axios.get.mockImplementation((url) => {
      if (url === '/api/auth/me') {
        return Promise.resolve({ data: { data: { user } } });
      }

      if (url === '/api/rooms') {
        return Promise.resolve({ data: { data: { rooms: [] } } });
      }

      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });

    renderApp('/register');

    await userEvent.type(screen.getByLabelText(/^name/i), user.name);
    await userEvent.type(screen.getByLabelText(/email/i), user.email);
    await userEvent.type(screen.getByLabelText(/^password/i), 'password123');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /register/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith('/api/auth/register', {
        name: user.name,
        email: user.email,
        password: 'password123',
      });
    });
    expect(await screen.findByText(/welcome, ada/i)).toBeInTheDocument();
    expect(localStorage.getItem('token')).toBe('register-token');
  });

  it('does not submit registration when passwords do not match', async () => {
    renderApp('/register');

    await userEvent.type(screen.getByLabelText(/^name/i), user.name);
    await userEvent.type(screen.getByLabelText(/email/i), user.email);
    await userEvent.type(screen.getByLabelText(/^password/i), 'password123');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'different');
    await userEvent.click(screen.getByRole('button', { name: /register/i }));

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(axios.post).not.toHaveBeenCalled();
  });
});
