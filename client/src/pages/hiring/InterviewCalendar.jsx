import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { hiringApi } from '../../lib/hiringApi.js';
import EmptyState from '../../components/hiring/EmptyState.jsx';

export default function InterviewCalendar() {
  const { canWrite } = useOutletContext();
  const [interviews, setInterviews] = useState([]);
  const [msg, setMsg] = useState('');

  function load() {
    hiringApi.listInterviews({ upcoming: 'true' }).then((d) => setInterviews(d.interviews || []));
  }

  useEffect(() => { load(); }, []);

  async function setOutcome(id, outcome) {
    try {
      await hiringApi.updateInterview(id, { outcome });
      setMsg(`Interview marked ${outcome}`);
      load();
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <>
      <h2 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#1B2A4A' }}>Upcoming interviews</h2>
      {msg && <p className="hr-muted">{msg}</p>}
      {!interviews.length ? (
        <EmptyState title="No upcoming interviews" hint="Schedule interviews from a candidate profile." />
      ) : (
        <div className="hr-grid">
          {interviews.map((iv) => (
            <div key={iv._id} className="hr-card">
              <strong>{iv.candidateName || 'Candidate'}</strong>
              <p className="hr-muted">
                Round {iv.round} · {iv.mode}
                <br />
                {iv.scheduledAt ? new Date(iv.scheduledAt).toLocaleString('en-IN') : 'TBD'}
              </p>
              {iv.panel?.length > 0 && <p className="hr-muted">Panel: {iv.panel.join(', ')}</p>}
              {canWrite && iv.outcome === 'Pending' && (
                <div className="hr-toolbar">
                  <button type="button" className="hr-btn hr-btn-sm hr-btn-gold" onClick={() => setOutcome(iv._id, 'Advance')}>Advance</button>
                  <button type="button" className="hr-btn hr-btn-sm hr-btn-outline" onClick={() => setOutcome(iv._id, 'Reject')}>Reject</button>
                  <button type="button" className="hr-btn hr-btn-sm hr-btn-outline" onClick={() => setOutcome(iv._id, 'Hold')}>Hold</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <p style={{ marginTop: '1rem' }}>
        <Link to="/app/hiring">← Back to requisitions</Link>
      </p>
    </>
  );
}
