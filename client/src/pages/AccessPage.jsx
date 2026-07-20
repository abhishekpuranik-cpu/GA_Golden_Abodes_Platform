import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../lib/api.js';
import '../theme/ga-access.css';

const GA_LOGO_SRC = '/brand/ga-logo.png';

const LOGIN_SLIDES = [
  {
    src: '/brand/login-carousel-1.png',
    label: 'Signature skyline',
  },
  {
    src: '/brand/login-carousel-2.png',
    label: 'Terraced living',
  },
];

export default function AccessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bootstrapMode, setBootstrapMode] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [slide, setSlide] = useState(0);
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

  useEffect(() => {
    const id = window.setInterval(() => {
      setSlide((i) => (i + 1) % LOGIN_SLIDES.length);
    }, 6500);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="ga-access">
      <aside className="ga-access-left" aria-hidden={false}>
        <div className="ga-access-slides" aria-hidden>
          {LOGIN_SLIDES.map((s, i) => (
            <div
              key={s.src}
              className={`ga-access-slide${i === slide ? ' is-active' : ''}`}
              style={{ backgroundImage: `url(${s.src})` }}
              role="img"
              aria-label={s.label}
            />
          ))}
          <div className="ga-access-veil" />
        </div>

        <Link to="/" className="ga-access-logo" aria-label="Golden Abodes home">
          <span className="ga-access-logo-plate">
            <img src={GA_LOGO_SRC} alt="Golden Abodes" className="ga-access-logo-img" width={180} height={60} decoding="async" />
          </span>
        </Link>

        <div className="ga-access-copy">
          <div className="ga-access-eyebrow">GOLDEN ABODES · PLATFORM</div>
          <p className="ga-access-tagline">Curated Addresses. Considered Lives.</p>
          <div className="ga-access-dots" role="tablist" aria-label="Project gallery">
            {LOGIN_SLIDES.map((s, i) => (
              <button
                key={s.src}
                type="button"
                className={`ga-access-dot${i === slide ? ' is-active' : ''}`}
                aria-label={s.label}
                aria-selected={i === slide}
                onClick={() => setSlide(i)}
              />
            ))}
          </div>
        </div>
      </aside>

      <main className="ga-access-right">
        <form className="ga-access-form access-page-form" onSubmit={onSubmit}>
          <div className="ga-access-form-brand">
            <img
              src={GA_LOGO_SRC}
              alt="Golden Abodes"
              className="ga-access-form-logo"
              width={200}
              height={66}
              decoding="async"
            />
          </div>
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
