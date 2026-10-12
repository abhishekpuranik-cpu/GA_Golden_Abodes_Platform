import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useOutletContext } from 'react-router-dom';
import { trackerApi, trackerCache } from '../../../lib/hiring/trackerApi.js';
import '../../../hiring-tracker.css';

const fromBoot = (b) => ({ loading: false, error: '', caps: b.caps, positions: b.positions || [], users: b.users || [] });

function preloadPages() {
  import('./TrackerPipeline.jsx');
  import('./TrackerCandidate.jsx');
  import('./TrackerDashboard.jsx');
}

export default function TrackerLayout() {
  const parent = useOutletContext() || {};
  trackerCache.bindUser(parent.user?.id || parent.user?._id || parent.user?.email);
  const [state, setState] = useState(() => {
    const boot = trackerCache.peek('bootstrap');
    return boot ? fromBoot(boot) : { loading: true, error: '', caps: null, positions: [], users: [] };
  });

  const load = useCallback(async () => {
    try {
      setState(fromBoot(await trackerApi.bootstrap()));
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message, denied: e.status === 403 }));
    }
  }, []);

  useEffect(() => {
    load();
    trackerApi.candidates({}).catch(() => {});
    preloadPages();
  }, [load]);

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
