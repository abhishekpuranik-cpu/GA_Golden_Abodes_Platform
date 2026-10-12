import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { trackerApi } from '../../../lib/hiring/trackerApi.js';
import {
  STAGES, STAGE_LABEL, STATUS_LABEL, ROUND_STATUS_LABEL, REASON_LABEL,
  fmtDate, daysSince, isOverdue, scoreTone, initials
} from '../../../lib/hiring/trackerLabels.js';
import AddCandidateModal from './AddCandidateModal.jsx';

const BUCKET_LABEL = {
  all: 'All candidates',
  hr_done: 'HR screenings completed',
  hr_cleared: 'Cleared HR screening',
  r1_done: '1st round completed',
  r2_done: '2nd round completed',
  pending_hr: 'Pending HR screening',
  pending_r1: 'Pending 1st round',
  pending_r2: 'Pending 2nd round',
  awaiting_decision: 'Awaiting decision',
  selected: 'Selected',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  on_hold: 'On hold',
  overdue: 'Overdue next actions',
  stale: 'Stuck > 7 days in stage',
  reached_decision: 'Reached decision'
};

const STATUS_FILTERS = [
  { v: 'open', label: 'Open (active + hold)' },
  { v: 'ACTIVE', label: 'Active' },
  { v: 'ON_HOLD', label: 'On hold' },
  { v: 'SELECTED', label: 'Selected' },
  { v: 'REJECTED', label: 'Rejected' },
  { v: 'WITHDRAWN', label: 'Withdrawn' },
  { v: 'all', label: 'All' }
];

function ScoreChip({ score, label, title }) {
  if (score == null) return null;
  return (
    <span className={`ht-score ht-score-${scoreTone(score)}`} title={title}>
      {label && <em>{label}</em>}{Number(score).toFixed(1)}
    </span>
  );
}

function StageAge({ c }) {
  const d = daysSince(c.stageEnteredAt);
  if (d == null || c.status !== 'ACTIVE') return null;
  const tone = d > 7 ? 'red' : d > 3 ? 'amber' : 'ok';
  return <span className={`ht-age ht-age-${tone}`} title="Days in current stage">{d}d</span>;
}

function StatusBadge({ c }) {
  if (c.status === 'ACTIVE') return null;
  return (
    <span className={`ht-status ht-status-${c.status.toLowerCase()}`} title={REASON_LABEL[c.statusReasonCode] || ''}>
      {STATUS_LABEL[c.status]}
    </span>
  );
}

function CandidateCard({ c, positionTitle, showMgmt, onOpen }) {
  const overdue = isOverdue(c);
  return (
    <button type="button" className={`ht-card ${c.status !== 'ACTIVE' ? 'is-muted' : ''}`} onClick={onOpen}>
      <div className="ht-card-top">
        <strong>{c.name}</strong>
        <StageAge c={c} />
      </div>
      <div className="ht-card-pos">{positionTitle}</div>
      {(c.currentCompany || c.totalExperienceYears != null) && (
        <div className="ht-card-meta">
          {c.currentCompany}{c.currentCompany && c.totalExperienceYears != null ? ' · ' : ''}
          {c.totalExperienceYears != null ? `${c.totalExperienceYears} yrs` : ''}
        </div>
      )}
      <div className="ht-card-chips">
        <StatusBadge c={c} />
        <ScoreChip score={c.hr?.status === 'SUBMITTED' ? c.hr.score : null} label="HR " title="HR screening score" />
        {showMgmt && <ScoreChip score={c.mgmtEval?.r1?.status === 'SUBMITTED' ? c.mgmtEval.r1.score : null} label="R1 " title="1st round score (management only)" />}
        {showMgmt && <ScoreChip score={c.mgmtEval?.r2?.status === 'SUBMITTED' ? c.mgmtEval.r2.score : null} label="R2 " title="2nd round score (management only)" />}
        {c.stage === 'MGMT_R1' && c.r1?.scheduledAt && c.r1.status === 'SCHEDULED' && (
          <span className="ht-chip">R1 {fmtDate(c.r1.scheduledAt, true)}</span>
        )}
        {c.overrideCount > 0 && showMgmt && <span className="ht-chip ht-chip-warn" title="Stage requirements were overridden">Override</span>}
      </div>
      {c.nextAction && (
        <div className={`ht-card-next ${overdue ? 'is-overdue' : ''}`}>
          <span>{c.nextAction}</span>
          {c.nextActionDue && <time>{overdue ? 'Overdue · ' : ''}{fmtDate(c.nextActionDue)}</time>}
        </div>
      )}
      {c.hrOwnerName && <span className="ht-avatar" title={`HR: ${c.hrOwnerName}`}>{initials(c.hrOwnerName)}</span>}
    </button>
  );
}

const SORTERS = {
  name: (c) => c.name.toLowerCase(),
  position: (c, p) => p,
  stage: (c) => STAGES.indexOf(c.stage),
  hr: (c) => (c.hr?.status === 'SUBMITTED' ? c.hr.score : -1),
  r1: (c) => (c.mgmtEval?.r1?.score ?? -1),
  due: (c) => (c.nextActionDue ? new Date(c.nextActionDue).getTime() : Infinity),
  age: (c) => -new Date(c.stageEnteredAt).getTime()
};

export default function TrackerPipeline() {
  const { caps, positions, users, user } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [sort, setSort] = useState({ key: 'due', dir: 1 });

  const view = params.get('view') || 'board';
  const filters = {
    q: params.get('q') || '',
    positionId: params.get('positionId') || '',
    stage: params.get('stage') || '',
    status: params.get('status') || (params.get('bucket') ? 'all' : 'open'),
    interviewer: params.get('interviewer') || '',
    bucket: params.get('bucket') || '',
    from: params.get('from') || '',
    to: params.get('to') || ''
  };

  const setFilter = (k, v) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  const load = useCallback(() => {
    const { q, status, ...rest } = filters;
    const apiStatus = ['open', 'all'].includes(status) ? '' : status;
    trackerApi.candidates({ ...rest, status: apiStatus })
      .then((d) => { setList(d.candidates || []); setErr(''); })
      .catch((e) => setErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.positionId, filters.stage, filters.status, filters.interviewer, filters.bucket, filters.from, filters.to]);

  useEffect(() => { load(); }, [load]);

  const posTitle = useMemo(() => Object.fromEntries(positions.map((p) => [p._id, p.title])), [positions]);

  const visible = useMemo(() => {
    if (!list) return [];
    const term = filters.q.trim().toLowerCase();
    let out = list;
    if (filters.status === 'open') out = out.filter((c) => ['ACTIVE', 'ON_HOLD'].includes(c.status));
    if (term) {
      out = out.filter((c) => [c.name, c.email, c.phone, c.currentCompany, c.currentDesignation, posTitle[c.positionId]]
        .some((v) => String(v || '').toLowerCase().includes(term)));
    }
    return out;
  }, [list, filters.q, filters.status, posTitle]);

  const sorted = useMemo(() => {
    const fn = SORTERS[sort.key] || SORTERS.due;
    return [...visible].sort((a, b) => {
      const x = fn(a, posTitle[a.positionId] || '');
      const y = fn(b, posTitle[b.positionId] || '');
      return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
    });
  }, [visible, sort, posTitle]);

  const open = (c) => navigate(`/app/hiring/tracker/c/${c._id}`);
  const th = (key, label) => (
    <th>
      <button type="button" className="ht-sort" onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}>
        {label}{sort.key === key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );
  const activeFilterCount = ['positionId', 'stage', 'interviewer', 'bucket', 'from', 'to', 'q'].filter((k) => filters[k]).length
    + (filters.status !== 'open' ? 1 : 0);

  return (
    <>
      <div className="ht-toolbar">
        <div className="ht-search">
          <input
            type="search"
            placeholder="Search name, company, phone, email…"
            value={filters.q}
            onChange={(e) => setFilter('q', e.target.value)}
          />
        </div>
        <div className="ht-seg" role="tablist" aria-label="View">
          <button type="button" className={view === 'board' ? 'on' : ''} onClick={() => setFilter('view', '')}>Board</button>
          <button type="button" className={view === 'table' ? 'on' : ''} onClick={() => setFilter('view', 'table')}>Table</button>
        </div>
        <button type="button" className="hr-btn hr-btn-gold" onClick={() => setShowAdd(true)}>+ Add candidate</button>
      </div>

      <div className="ht-filters">
        <select value={filters.positionId} onChange={(e) => setFilter('positionId', e.target.value)} aria-label="Position">
          <option value="">All positions</option>
          {positions.map((p) => <option key={p._id} value={p._id}>{p.title}</option>)}
        </select>
        <select value={filters.stage} onChange={(e) => setFilter('stage', e.target.value)} aria-label="Stage">
          <option value="">All stages</option>
          {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilter('status', e.target.value === 'open' ? '' : e.target.value)} aria-label="Status">
          {STATUS_FILTERS.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
        </select>
        <select value={filters.interviewer} onChange={(e) => setFilter('interviewer', e.target.value)} aria-label="Owner or interviewer">
          <option value="">Any owner / interviewer</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        {filters.bucket && (
          <span className="ht-filter-chip">
            {BUCKET_LABEL[filters.bucket] || filters.bucket}
            <button type="button" onClick={() => setFilter('bucket', '')} aria-label="Clear">×</button>
          </span>
        )}
        {(filters.from || filters.to) && (
          <span className="ht-filter-chip">
            Added {filters.from ? `from ${fmtDate(filters.from)}` : ''} {filters.to ? `to ${fmtDate(filters.to)}` : ''}
            <button type="button" onClick={() => { const n = new URLSearchParams(params); n.delete('from'); n.delete('to'); setParams(n, { replace: true }); }} aria-label="Clear dates">×</button>
          </span>
        )}
        {activeFilterCount > 0 && (
          <button type="button" className="ht-link-btn" onClick={() => setParams(view === 'table' ? { view: 'table' } : {}, { replace: true })}>
            Clear filters
          </button>
        )}
        <span className="ht-count">{list ? `${visible.length} candidate${visible.length === 1 ? '' : 's'}` : ''}</span>
      </div>

      {err && <p className="hr-error">{err}</p>}
      {!list && !err && <p className="hr-muted">Loading candidates…</p>}

      {list && !list.length && !activeFilterCount && (
        <div className="ht-empty-card">
          <h2>No candidates yet</h2>
          <p className="hr-muted">Add your first shortlisted candidate against one of the {positions.length} open positions.</p>
          <button type="button" className="hr-btn hr-btn-gold" onClick={() => setShowAdd(true)}>+ Add candidate</button>
        </div>
      )}

      {list && (list.length > 0 || activeFilterCount > 0) && view === 'board' && (
        <div className="ht-board">
          {STAGES.map((s) => {
            const col = visible.filter((c) => c.stage === s);
            return (
              <section key={s} className="ht-col">
                <header>
                  <span>{STAGE_LABEL[s]}</span>
                  <b>{col.length}</b>
                </header>
                <div className="ht-col-body">
                  {col.length ? col.map((c) => (
                    <CandidateCard key={c._id} c={c} positionTitle={posTitle[c.positionId]} showMgmt={caps.mgmt} onOpen={() => open(c)} />
                  )) : <p className="ht-col-empty">—</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {list && (list.length > 0 || activeFilterCount > 0) && view === 'table' && (
        <div className="ht-table-wrap">
          <table className="ht-table">
            <thead>
              <tr>
                {th('name', 'Candidate')}
                {th('position', 'Position')}
                {th('stage', 'Stage')}
                <th>Status</th>
                {th('hr', 'HR score')}
                {caps.mgmt ? th('r1', '1st round') : <th>1st round</th>}
                <th>2nd round</th>
                <th>HR owner / interviewer</th>
                {th('due', 'Next action')}
                {th('age', 'In stage')}
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c._id} onClick={() => open(c)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && open(c)}>
                  <td>
                    <Link to={`/app/hiring/tracker/c/${c._id}`} onClick={(e) => e.stopPropagation()} className="ht-name-link">{c.name}</Link>
                    <div className="ht-sub">{[c.phone, c.email].filter(Boolean).join(' · ')}</div>
                    <div className="ht-sub">{[c.currentCompany, c.totalExperienceYears != null ? `${c.totalExperienceYears} yrs` : ''].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td>{posTitle[c.positionId]}</td>
                  <td>{STAGE_LABEL[c.stage]}</td>
                  <td>
                    <span className={`ht-status ht-status-${c.status.toLowerCase()}`}>{STATUS_LABEL[c.status]}</span>
                    {c.statusReasonCode && <div className="ht-sub">{REASON_LABEL[c.statusReasonCode]}</div>}
                  </td>
                  <td>
                    {c.hr?.status === 'SUBMITTED'
                      ? <ScoreChip score={c.hr.score} />
                      : <span className="ht-sub">{c.hr?.status === 'DRAFT' ? 'In progress' : '—'}</span>}
                  </td>
                  <td>
                    {caps.mgmt && c.mgmtEval?.r1?.status === 'SUBMITTED'
                      ? <ScoreChip score={c.mgmtEval.r1.score} />
                      : <span className="ht-sub">{c.r1EvalStatus === 'SUBMITTED' ? 'Completed' : ROUND_STATUS_LABEL[c.r1?.status] || '—'}</span>}
                    {c.r1?.scheduledAt && c.r1EvalStatus !== 'SUBMITTED' && <div className="ht-sub">{fmtDate(c.r1.scheduledAt, true)}</div>}
                  </td>
                  <td>
                    {!c.r2Required ? <span className="ht-sub">Not required</span>
                      : caps.mgmt && c.mgmtEval?.r2?.status === 'SUBMITTED'
                        ? <ScoreChip score={c.mgmtEval.r2.score} />
                        : <span className="ht-sub">{c.r2EvalStatus === 'SUBMITTED' ? 'Completed' : ROUND_STATUS_LABEL[c.r2?.status]}</span>}
                  </td>
                  <td>
                    <div>{c.hrOwnerName || '—'}</div>
                    {c.r1?.interviewerName && <div className="ht-sub">R1: {c.r1.interviewerName}</div>}
                  </td>
                  <td className={isOverdue(c) ? 'is-overdue' : ''}>
                    <div>{c.nextAction || '—'}</div>
                    {c.nextActionDue && <div className="ht-sub">{isOverdue(c) ? 'Overdue · ' : ''}{fmtDate(c.nextActionDue)}</div>}
                  </td>
                  <td><StageAge c={c} /></td>
                </tr>
              ))}
              {!sorted.length && (
                <tr><td colSpan={10} className="ht-col-empty">No candidates match these filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddCandidateModal
          positions={positions}
          users={users}
          defaultPositionId={filters.positionId}
          currentUserId={user?.id}
          onClose={() => setShowAdd(false)}
          onCreated={(c) => { setShowAdd(false); navigate(`/app/hiring/tracker/c/${c._id}`); }}
        />
      )}
    </>
  );
}
