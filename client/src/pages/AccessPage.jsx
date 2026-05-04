import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { accessApi } from '../lib/api.js';

export default function AccessPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const next = useMemo(() => {
    const n = String(searchParams.get('next') || '/');
    return n.startsWith('/') ? n : '/';
  }, [searchParams]);

  async function onSubmit(e) {
    e.preventDefault();
    if (!code.trim()) {
      setError('Enter the access code.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await accessApi.login(code.trim());
      navigate(next, { replace: true });
    } catch (err) {
      setError(err?.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0f172a', color: '#e2e8f0', padding: 20 }}>
      <form
        onSubmit={onSubmit}
        style={{ width: '100%', maxWidth: 420, background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(148, 163, 184, 0.4)', borderRadius: 12, padding: 18 }}
      >
        <div style={{ fontWeight: 700, fontSize: 19, marginBottom: 8 }}>Restricted Planner Access</div>
        <div style={{ color: '#94a3b8', marginBottom: 14, fontSize: 13 }}>
          Enter the shared code to open V2 / V3. Vault home and other apps remain public.
        </div>
        <input
          type="password"
          placeholder="Access code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          style={{ width: '100%', padding: '11px 12px', borderRadius: 8, border: '1px solid #334155', background: '#020617', color: '#e2e8f0', marginBottom: 12 }}
        />
        {error ? <div style={{ color: '#fca5a5', marginBottom: 10, fontSize: 12 }}>{error}</div> : null}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="submit"
            disabled={busy}
            style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #1558a0', background: '#1558a0', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >
            {busy ? 'Checking…' : 'Continue'}
          </button>
          <Link to="/" style={{ alignSelf: 'center', color: '#93c5fd', textDecoration: 'none', fontSize: 13 }}>
            Back to Vault
          </Link>
        </div>
      </form>
    </div>
  );
}
