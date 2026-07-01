import { Link } from 'react-router-dom';

export default function ClpLetterFlowGuide({ unitId, hasTasks, hasPendingDemands }) {
  return (
    <div className="ps-clp-flow-guide">
      <strong>How Step 12 works (per CLP milestone / installment)</strong>
      <ol>
        <li>
          <strong>Construction completes a milestone</strong> — set <em>Actual date</em> on the matching row in{' '}
          <Link to="/app/post-sales/demands">Demands &amp; collections</Link>.
        </li>
        <li>
          <strong>A CLP letter activity is created</strong> for that milestone (shown below under Active).
        </li>
        <li>
          <strong>Complete the 10-item checklist</strong> for that milestone only — tick items and attach files on the Documents tab or inside each activity card.
        </li>
        <li>
          <strong>Mark that letter activity Complete</strong> when checklist and payment follow-up are done.
        </li>
        <li>
          <strong>Repeat</strong> for every CLP / installment until all letter activities are done and demands are paid — then close Step 12.
        </li>
      </ol>
      {!hasTasks && (
        <p className="ps-clp-flow-note">
          {hasPendingDemands
            ? 'No letter activity yet — set Actual date on a demand row when Engineering confirms the milestone.'
            : 'No CLP demands on this unit yet — import collections or add milestone rows in Demands first.'}
          {unitId ? (
            <> · <Link to={`/app/post-sales/units/${unitId}?step=12`}>Refresh this page</Link> after triggering.</>
          ) : null}
        </p>
      )}
      <p className="ps-reports-muted" style={{ marginBottom: 0 }}>
        The &quot;Station checklist&quot; at the bottom is for closing Step 12 after <em>all</em> milestones are finished — day-to-day work happens in each CLP letter activity above.
      </p>
    </div>
  );
}
