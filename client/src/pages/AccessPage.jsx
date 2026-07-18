import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api.js';
import '../theme/ga-access.css';

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
        if (name.trim()) {
          try {
            window.localStorage.setItem('ga_user_name', name.trim());
          } catch {
            /* ignore */
          }
        }
      } else {
        await authApi.login(email.trim(), password.trim());
      }
      try {
        const s = await authApi.session();
        if (s?.authenticated && s.user) {
          const dn = (s.user.name || '').trim() || String(s.user.email || '').split('@')[0] || 'User';
          window.localStorage.setItem('ga_user_name', dn);
        }
      } catch {
        /* ignore */
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
    authApi
      .session()
      .then((s) => {
        if (s?.authenticated) navigate(next, { replace: true });
      })
      .catch(() => {});
  }, [navigate, next]);

  return (
    <div className="ga-access">
      <aside className="ga-access-left" aria-hidden={false}>
        <Link to="/" className="ga-access-logo">
          <span className="ga-access-mark">G</span>
          <span>GOLDEN ABODES</span>
        </Link>
        <div className="ga-access-slides" aria-hidden>
          <div className="ga-access-slide" />
          <div className="ga-access-slide" />
          <div className="ga-access-slide" />
        </div>
        <div className="ga-access-copy">
          <div className="ga-access-eyebrow">GOLDEN ABODES · PLATFORM</div>
          <p className="ga-access-tagline">Curated Addresses. Considered Lives.</p>
        </div>
      </aside>

      <main className="ga-access-right">
        <form className="ga-access-form access-page-form" onSubmit={onSubmit}>
          <div className="ga-access-form-eyebrow">SIGN IN</div>
          <h1>{bootstrapMode ? 'Create admin.' : 'The vault.'}</h1>
          <p className="ga-access-form-sub">
            {bootstrapMode
              ? 'No users found. Set up the first admin account.'
              : 'Sign in to access assigned apps, projects, and tabs.'}
          </p>
          {bootstrapMode ? (
            <label>
              <span className="ga-lbl">Full name</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
          ) : null}
          <label>
            <span className="ga-lbl">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            <span className="ga-lbl">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={bootstrapMode ? 'new-password' : 'current-password'}
              required
            />
          </label>
          {error ? <div className="ga-access-error">{error}</div> : null}
          <div className="ga-access-actions">
            <button type="submit" className="ga-access-submit ga-interactive" disabled={busy}>
              {busy ? 'Checking…' : bootstrapMode ? 'Create Admin' : 'Continue'}
            </button>
            <Link to="/" className="ga-access-back">
              Back to Vault
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}
