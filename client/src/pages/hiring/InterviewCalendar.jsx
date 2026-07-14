import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import ActivityCalendarShell from '../../components/postsales/ActivityCalendarShell.jsx';
import { hiringApi } from '../../lib/hiringApi.js';
import { parseYmd, todayYmd } from '../../lib/postsales/activityCalendarUtils.js';
import EmptyState from '../../components/hiring/EmptyState.jsx';

const LEGEND = [{ label: 'Interview', color: '#9333ea' }];

function interviewYmd(iv) {
  if (!iv?.scheduledAt) return null;
  const d = new Date(iv.scheduledAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function interviewTitle(iv) {
  const name = iv.candidateName || 'Candidate';
  return `R${iv.round || '?'} · ${name}`;
}

function interviewColor(iv) {
  if (iv.outcome === 'Advance') return '#15803d';
  if (iv.outcome === 'Reject') return '#dc2626';
  if (iv.outcome === 'Hold') return '#ca8a04';
  return '#9333ea';
}

export default function InterviewCalendar() {
  const { canWrite } = useOutletContext();
  const [interviews, setInterviews] = useState([]);
  const [msg, setMsg] = useState('');
  const [view, setView] = useState('month');
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [selectedYmd, setSelectedYmd] = useState(todayYmd());
  const [selectedInterview, setSelectedInterview] = useState(null);

  function load() {
    hiringApi.listInterviews().then((d) => setInterviews(d.interviews || []));
  }

  useEffect(() => { load(); }, []);

  const scheduled = useMemo(
    () => interviews.filter((iv) => interviewYmd(iv)),
    [interviews]
  );

  const selectedDayInterviews = useMemo(() => {
    if (!selectedYmd) return [];
    return scheduled.filter((iv) => interviewYmd(iv) === selectedYmd);
  }, [scheduled, selectedYmd]);

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
      <h2 style={{ fontFamily: 'Cormorant Garamond, serif', color: '#1B2A4A' }}>Interview calendar</h2>
      {msg && <p className="hr-muted">{msg}</p>}

      {!scheduled.length ? (
        <EmptyState title="No scheduled interviews" hint="Schedule interviews from a candidate profile." />
      ) : (
        <>
          <ActivityCalendarShell
            eyebrow="Hiring"
            view={view}
            cursorDate={cursorDate}
            selectedYmd={selectedYmd}
            tasks={scheduled}
            getTaskYmd={interviewYmd}
            getTaskId={(iv) => iv._id}
            getTaskTitle={interviewTitle}
            getTaskColor={interviewColor}
            onViewChange={setView}
            onCursorChange={setCursorDate}
            onToday={() => {
              const t = new Date();
              setCursorDate(t);
              setSelectedYmd(todayYmd());
            }}
            onSelectDay={(ymd) => {
              setSelectedYmd(ymd);
              const d = parseYmd(ymd);
              if (d) setCursorDate(d);
              setSelectedInterview(null);
            }}
            onTaskClick={setSelectedInterview}
            legend={LEGEND}
          />

          {selectedInterview ? (
            <div className="hr-card" style={{ marginTop: '1rem' }}>
              <strong>{selectedInterview.candidateName || 'Candidate'}</strong>
              <p className="hr-muted">
                Round {selectedInterview.round} · {selectedInterview.mode}
                <br />
                {selectedInterview.scheduledAt
                  ? new Date(selectedInterview.scheduledAt).toLocaleString('en-IN')
                  : 'TBD'}
              </p>
              {selectedInterview.panel?.length > 0 && (
                <p className="hr-muted">Panel: {selectedInterview.panel.join(', ')}</p>
              )}
              {canWrite && selectedInterview.outcome === 'Pending' && (
                <div className="hr-toolbar">
                  <button type="button" className="hr-btn hr-btn-sm hr-btn-gold" onClick={() => setOutcome(selectedInterview._id, 'Advance')}>Advance</button>
                  <button type="button" className="hr-btn hr-btn-sm hr-btn-outline" onClick={() => setOutcome(selectedInterview._id, 'Reject')}>Reject</button>
                  <button type="button" className="hr-btn hr-btn-sm hr-btn-outline" onClick={() => setOutcome(selectedInterview._id, 'Hold')}>Hold</button>
                </div>
              )}
            </div>
          ) : null}

          {selectedYmd && selectedDayInterviews.length > 0 && !selectedInterview ? (
            <div className="hr-grid" style={{ marginTop: '1rem' }}>
              {selectedDayInterviews.map((iv) => (
                <div key={iv._id} className="hr-card" role="button" tabIndex={0} onClick={() => setSelectedInterview(iv)} onKeyDown={(e) => { if (e.key === 'Enter') setSelectedInterview(iv); }}>
                  <strong>{iv.candidateName || 'Candidate'}</strong>
                  <p className="hr-muted">
                    Round {iv.round} · {iv.mode}
                    <br />
                    {iv.scheduledAt ? new Date(iv.scheduledAt).toLocaleString('en-IN') : 'TBD'}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}

      <p style={{ marginTop: '1rem' }}>
        <Link to="/app/hiring">← Back to requisitions</Link>
      </p>
    </>
  );
}
