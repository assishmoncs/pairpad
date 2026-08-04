import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAsyncAction } from '../hooks/useAsyncAction';
import FormField from '../components/FormField';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const {
    run,
    pending: loading,
    error,
  } = useAsyncAction(async () => {
    await login(email, password);
    navigate('/dashboard');
  }, 'Login failed. Please try again.');

  const handleSubmit = (e) => {
    e.preventDefault();
    run();
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <h1>Login to PairPad</h1>

        {error && <div className="error-message" aria-live="polite">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <FormField
            id="email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="Enter your email"
            required
          />

          <FormField
            id="password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={setPassword}
            placeholder="Enter your password"
            required
            rightElement={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Hide password' : 'Show password'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.8em', color: '#888' }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            }
          />

          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p className="auth-link">
          Don't have an account? <Link to="/register">Register here</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
