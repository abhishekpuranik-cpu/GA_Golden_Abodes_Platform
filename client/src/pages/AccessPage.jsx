import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api.js';

export default function AccessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bootstrapMode, setBootstrapMode] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const next = useMemo(() => {
    const n = String(searchParams.get('next') || '/');
    return n.startsWith('/') ? n : '/';
  }, [searchParams]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Enter email and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (bootstrapMode) {
        await authApi.bootstrap({ email: email.trim(), password: password.trim(), name: name.trim() });
      } else {
        await authApi.login(email.trim(), password.trim());
      }
      navigate(next, { replace: true });
    } catch (err) {
      setError(err?.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  async function checkBootstrap() {
    try {
      const r = await authApi.bootstrapStatus();
      setBootstrapMode(!!r?.needsBootstrap);
    } catch {
      setBootstrapMode(false);
    }
  }

  useEffect(() => {
    void checkBootstrap();
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0f172a', color: '#e2e8f0', padding: 20 }}>
      <form
        onSubmit={onSubmit}
        style={{ width: '100%', maxWidth: 420, background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(148, 163, 184, 0.4)', borderRadius: 12, padding: 18 }}
      >
        <div style={{ fontWeight: 700, fontSize: 19, marginBottom: 8 }}>{bootstrapMode ? 'Create First Admin' : 'Login to App Vault'}</div>
        <div style={{ color: '#94a3b8', marginBottom: 14, fontSize: 13 }}>
          {bootstrapMode ? 'No users found. Set up the first admin account.' : 'Sign in to access assigned apps, projects, and tabs.'}
        </div>
        {bootstrapMode ? (
          <input
            type="text"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: '100%', padding: '11px 12px', borderRadius: 8, border: '1px solid #334155', background: '#020617', color: '#e2e8f0', marginBottom: 12 }}
          />
        ) : null}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ width: '100%', padding: '11px 12px', borderRadius: 8, border: '1px solid #334155', background: '#020617', color: '#e2e8f0', marginBottom: 12 }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: '100%', padding: '11px 12px', borderRadius: 8, border: '1px solid #334155', background: '#020617', color: '#e2e8f0', marginBottom: 12 }}
        />
        {error ? <div style={{ color: '#fca5a5', marginBottom: 10, fontSize: 12 }}>{error}</div> : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <button
            type="submit"
            disabled={busy}
            style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid #1558a0', background: '#1558a0', color: '#fff', fontWeight: 700, cursor: 'pointer', minHeight: 44 }}
          >
            {busy ? 'Checking…' : bootstrapMode ? 'Create Admin' : 'Continue'}
          </button>
          <Link to="/" style={{ alignSelf: 'center', color: '#93c5fd', textDecoration: 'none', fontSize: 13 }}>
            Back to Vault
          </Link>
        </div>
      </form>
    </div>
  );
}
