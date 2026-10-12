import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useOutletContext } from 'react-router-dom';
import { trackerApi } from '../../../lib/hiring/trackerApi.js';
import '../../../hiring-tracker.css';

export default function TrackerLayout() {
  const parent = useOutletContext() || {};
  const [state, setState] = useState({ loading: true, error: '', caps: null, positions: [], users: [] });

  const load = useCallback(async () => {
    try {
      const [me, pos, us] = await Promise.all([trackerApi.me(), trackerApi.positions(), trackerApi.users()]);
      setState({ loading: false, error: '', caps: me.caps, positions: pos.positions || [], users: us.users || [] });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message, denied: e.status === 403 }));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (state.loading) return <p className="hr-muted">Loading Hiring Tracker…</p>;
  if (state.error) {
    return (
      <div className="ht-empty-card">
        <h2>{state.denied ? 'Hiring Tracker access not granted' : 'Could not load Hiring Tracker'}</h2>
        <p className="hr-muted">{state.error}</p>
      </div>
    );
  }

  const { caps } = state;
  const roleLabel = caps.decide ? 'Decision-maker' : caps.mgmt ? 'Management interviewer' : 'HR';

  return (
    <div className="ht-root">
      <div className="ht-subnav">
        <nav>
          <NavLink to="/app/hiring/tracker" end className={({ isActive }) => (isActive ? 'active' : '')}>Pipeline</NavLink>
          <NavLink to="/app/hiring/tracker/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>Dashboard</NavLink>
          {(caps.editHrTemplates || caps.editMgmtTemplates) && (
            <NavLink to="/app/hiring/tracker/questionnaires" className={({ isActive }) => (isActive ? 'active' : '')}>Questionnaires</NavLink>
          )}
        </nav>
        <span className="ht-role-pill" title="Your Hiring Tracker access level">{roleLabel}</span>
      </div>
      <Outlet context={{ ...state, user: parent.user, reloadRefs: load }} />
    </div>
  );
}
