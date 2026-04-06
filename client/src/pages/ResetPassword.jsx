import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Moon } from 'lucide-react';

export default function ResetPassword() {
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.search).get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const data = await api.post('/auth/reset-password', { token, password });
      setMessage(data.message + ' Redirecting to login…');
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-space-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm card space-y-4 text-center">
          <div className="text-5xl mb-3"><Moon size={48} className="text-amber-300 mx-auto" /></div>
          <h2 className="text-lg font-semibold text-white">Invalid Reset Link</h2>
          <p className="text-sm text-slate-400">
            This password reset link is invalid or has expired.
          </p>
          <Link to="/forgot-password" className="btn-primary inline-block">
            Request New Link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-space-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3"><Moon size={48} className="text-amber-300 mx-auto" /></div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Lunara</h1>
          <p className="text-slate-400 text-sm mt-1">Set New Password</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <h2 className="text-lg font-semibold text-white">Reset Password</h2>

          {error && (
            <div className="bg-red-900/40 border border-red-700/50 text-red-300 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {message && (
            <div className="bg-green-900/40 border border-green-700/50 text-green-300 text-sm rounded-lg px-4 py-3">
              {message}
            </div>
          )}

          <div>
            <label className="label">New Password</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
            />
          </div>

          <div>
            <label className="label">Confirm Password</label>
            <input
              type="password"
              className="input"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
            />
          </div>

          <button className="btn-primary w-full" disabled={loading || !!message}>
            {loading ? 'Resetting…' : 'Reset Password'}
          </button>

          <p className="text-center text-sm text-slate-400">
            <Link to="/login" className="text-blue-400 hover:text-blue-300">
              Back to Sign In
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
