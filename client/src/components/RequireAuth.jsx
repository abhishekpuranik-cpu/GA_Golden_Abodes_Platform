import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authApi } from '../lib/api.js';

function userHasApp(user, appId) {
  const allowed = new Set((user?.allowedApps || []).map((x) => String(x)));
  if (allowed.has(appId)) return true;
  if (appId === 'v3_project_acquisition' && allowed.has('v3_org_planner')) return true;
  return false;
}

export default function RequireAuth({ children, appId, permission }) {
  const location = useLocation();
  const [state, setState] = useState({ checked: false, user: null });

  useEffect(() => {
    let alive = true;
    authApi
      .session()
      .then((s) => {
        if (!alive) return;
        setState({ checked: true, user: s?.authenticated ? s.user : null });
      })
      .catch(() => {
        if (alive) setState({ checked: true, user: null });
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!state.checked) {
    return <div style={{ padding: 24, color: '#94a3b8' }}>Checking session…</div>;
  }

  if (!state.user) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/access?next=${next}`} replace />;
  }

  if (permission && !(state.user.permissions || []).includes(permission)) {
    return (
      <div style={{ maxWidth: 720, margin: '10vh auto', padding: 24, textAlign: 'center' }}>
        <h2>Access denied</h2>
        <p style={{ color: '#94a3b8' }}>You do not have permission for this page.</p>
      </div>
    );
  }

  if (appId && !userHasApp(state.user, appId)) {
    return (
      <div style={{ maxWidth: 720, margin: '10vh auto', padding: 24, textAlign: 'center' }}>
        <h2>Access denied</h2>
        <p style={{ color: '#94a3b8' }}>This app is not assigned to your account.</p>
      </div>
    );
  }

  return children;
}
