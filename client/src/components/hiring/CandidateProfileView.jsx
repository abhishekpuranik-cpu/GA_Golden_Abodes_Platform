import { formatINR, STAGE_LABELS } from '../../lib/hiring/formatINR.js';

function ProfileSection({ title, children }) {
  if (!children) return null;
  return (
    <div className="hr-card hr-profile-section">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export default function CandidateProfileView({ candidate, profile, requisition }) {
  if (!candidate) return null;
  const p = profile || candidate.profileSnapshot || null;
  const summary = Array.isArray(p?.summary) && p.summary.length
    ? p.summary
    : String(candidate.highlights || '').split('\n').filter(Boolean).map((d) => ({ description: d }));

  const experience = Array.isArray(p?.experience) ? p.experience : [];
  const education = Array.isArray(p?.education) ? p.education : [];
  const skills = Array.isArray(p?.skills) ? p.skills : [];
  const languages = Array.isArray(p?.languages) ? p.languages : [];

  return (
    <div className="hr-profile-grid">
      <div className="hr-card hr-profile-card">
        <div className="hr-profile-header">
          <div>
            <h2>{candidate.name || 'Candidate'}</h2>
            {p?.headline && <p className="hr-profile-headline">{p.headline}</p>}
            <p className="hr-muted">
              {candidate.source === 'agency' && candidate.agencyName
                ? `Agency · ${candidate.agencyName}`
                : (candidate.source || '—')}
              {candidate.currentCompany ? ` · ${candidate.currentCompany}` : ''}
              {(candidate.cityCurrent || p?.location) ? ` · ${candidate.cityCurrent || p.location}` : ''}
            </p>
          </div>
          {candidate.linkedinUrl && (
            <a href={candidate.linkedinUrl} target="_blank" rel="noreferrer" className="hr-btn hr-btn-outline hr-btn-sm">
              LinkedIn ↗
            </a>
          )}
        </div>

        <StageStepperInline current={Number(candidate.currentStageNumber) || 1} />

        <div className="hr-profile-facts">
          <div><span className="hr-muted">Stage</span><strong>{STAGE_LABELS[candidate.currentStageNumber] || '—'}</strong></div>
          <div><span className="hr-muted">Requisition</span><strong>{requisition?.reqCode || '—'}{requisition?.role ? ` — ${requisition.role}` : ''}</strong></div>
          {candidate.email && <div><span className="hr-muted">Email</span><strong>{candidate.email}</strong></div>}
          {candidate.phone && <div><span className="hr-muted">Phone</span><strong>{candidate.phone}</strong></div>}
          {(candidate.currentCtcPaise != null || candidate.expectedCtcPaise != null) && (
            <div>
              <span className="hr-muted">CTC</span>
              <strong>{formatINR(candidate.currentCtcPaise)} → {formatINR(candidate.expectedCtcPaise)}</strong>
            </div>
          )}
          {candidate.noticePeriodDays != null && (
            <div><span className="hr-muted">Notice</span><strong>{candidate.noticePeriodDays} days</strong></div>
          )}
          {candidate.source === 'agency' && candidate.agencyName && (
            <div><span className="hr-muted">Agency</span><strong>{candidate.agencyName}</strong></div>
          )}
          {candidate.agencyContact && (
            <div><span className="hr-muted">Agency contact</span><strong>{candidate.agencyContact}</strong></div>
          )}
          {candidate.agencyEmail && (
            <div><span className="hr-muted">Agency email</span><strong>{candidate.agencyEmail}</strong></div>
          )}
          {candidate.agencyNotes && (
            <div><span className="hr-muted">Agency notes</span><strong>{candidate.agencyNotes}</strong></div>
          )}
          {p?.pack != null && <div><span className="hr-muted">Metaview pack</span><strong>#{p.pack}</strong></div>}
        </div>
      </div>

      {summary.length > 0 && (
        <ProfileSection title="AI match summary">
          <ul className="hr-profile-summary">
            {summary.map((s, i) => (
              <li key={i}>{s.description || s.title || '—'}</li>
            ))}
          </ul>
        </ProfileSection>
      )}

      {experience.length > 0 && (
        <ProfileSection title="Experience">
          <div className="hr-timeline">
            {experience.map((exp, i) => (
              <div key={i} className="hr-timeline-item">
                <strong>{exp.jobTitle || 'Role'}</strong>
                <span className="hr-muted">{exp.company || '—'}{exp.companyIndustry ? ` · ${exp.companyIndustry}` : ''}</span>
                <span className="hr-muted">
                  {[exp.start, exp.end || (exp.current ? 'Present' : '')].filter(Boolean).join(' – ') || '—'}
                  {exp.location ? ` · ${exp.location}` : ''}
                </span>
                {exp.description && <p>{String(exp.description).replace(/&amp;/g, '&')}</p>}
              </div>
            ))}
          </div>
        </ProfileSection>
      )}

      {education.length > 0 && (
        <ProfileSection title="Education">
          <ul className="hr-profile-list">
            {education.map((ed, i) => (
              <li key={i}>
                <strong>{ed.degree || '—'}</strong>
                <span className="hr-muted">{ed.institution || ''}</span>
                {(ed.start || ed.end) && (
                  <span className="hr-muted">{[ed.start, ed.end].filter(Boolean).join(' – ')}</span>
                )}
              </li>
            ))}
          </ul>
        </ProfileSection>
      )}

      {(skills.length > 0 || languages.length > 0) && (
        <ProfileSection title="Skills & languages">
          {skills.length > 0 && (
            <div className="hr-chip-row">
              {skills.map((s, i) => (
                <span key={i} className="hr-badge">{typeof s === 'string' ? s : (s?.name || s?.skill || '—')}</span>
              ))}
            </div>
          )}
          {languages.length > 0 && (
            <p className="hr-muted" style={{ marginTop: '0.5rem' }}>
              Languages: {languages.map((l) => (typeof l === 'string' ? l : (l?.name || l?.language || ''))).filter(Boolean).join(', ')}
            </p>
          )}
        </ProfileSection>
      )}

      {!p && candidate.highlights && (
        <ProfileSection title="Notes">
          <p style={{ whiteSpace: 'pre-wrap' }}>{candidate.highlights}</p>
        </ProfileSection>
      )}
    </div>
  );
}

function StageStepperInline({ current }) {
  return (
    <div className="hr-stage-inline">
      {Object.entries(STAGE_LABELS).filter(([n]) => Number(n) <= 7).map(([n, label]) => {
        const num = Number(n);
        const active = num === current;
        const done = num < current;
        return (
          <span key={n} className={`hr-stage-dot${active ? ' active' : ''}${done ? ' done' : ''}`} title={label}>
            {num}
          </span>
        );
      })}
    </div>
  );
}
