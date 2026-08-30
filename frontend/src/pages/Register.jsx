import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAsyncAction } from '../hooks/useAsyncAction';
import FormField from '../components/FormField';
import Logo from '../components/Logo';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const {
    run,
    pending: loading,
    error,
    setError,
  } = useAsyncAction(async () => {
    await register(name, email, password);
    navigate('/dashboard');
  }, 'Registration failed. Please try again.');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    run();
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <Logo size={48} />
        </div>
        <h1>Create Account</h1>

        {error && <div className="error-message" aria-live="polite">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <FormField
            id="name"
            label="Name"
            value={name}
            onChange={setName}
            placeholder="Enter your name"
            required
          />

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
            placeholder="Create a password"
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

          <FormField
            id="confirmPassword"
            label="Confirm Password"
            type={showConfirmPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Confirm your password"
            required
            rightElement={
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                title={showConfirmPassword ? 'Hide password' : 'Show password'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.8em', color: '#888' }}
              >
                {showConfirmPassword ? 'Hide' : 'Show'}
              </button>
            }
          />

          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Creating account...' : 'Register'}
          </button>
        </form>

        <p className="auth-link">
          Already have an account? <Link to="/login">Login here</Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
