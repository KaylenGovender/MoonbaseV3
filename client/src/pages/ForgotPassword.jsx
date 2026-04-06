import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api.js';
import { Moon } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const data = await api.post('/auth/forgot-password', { email });
      setMessage(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-space-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3"><Moon size={48} className="text-amber-300 mx-auto" /></div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Lunara</h1>
          <p className="text-slate-400 text-sm mt-1">Password Recovery</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <h2 className="text-lg font-semibold text-white">Forgot Password</h2>
          <p className="text-sm text-slate-400">
            Enter your email and we'll send you a link to reset your password.
          </p>

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
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <button className="btn-primary w-full" disabled={loading}>
            {loading ? 'Sending…' : 'Send Reset Link'}
          </button>

          <p className="text-center text-sm text-slate-400">
            Remember your password?{' '}
            <Link to="/login" className="text-blue-400 hover:text-blue-300">
              Sign In
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
