import { useEffect, useMemo, useState } from 'react';

import { Link } from 'react-router-dom';

import { useUnits } from '../../hooks/postsales/useUnits.js';

import { useInventoryFilters } from '../../hooks/postsales/useInventoryFilters.js';

import PostSalesFilterBar from '../../components/postsales/PostSalesFilterBar.jsx';

import NewUnitModal from '../../components/postsales/NewUnitModal.jsx';

import { postSalesApi } from '../../lib/postSalesApi.js';



function fmt(n) {

  if (n == null) return '—';

  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

}



function dotClass(status) {

  if (status === 'completed') return 'completed';

  if (status === 'overdue') return 'overdue';

  if (status === 'in_progress') return 'in_progress';

  return 'pending';

}



export default function Units() {

  const [status, setStatus] = useState('');

  const [showModal, setShowModal] = useState(false);

  const [syncMsg, setSyncMsg] = useState('');

  const [syncing, setSyncing] = useState(false);

  const [v1Status, setV1Status] = useState(null);



  const filtersApi = useInventoryFilters();

  const { project, phase, building, setProject, setPhase, setBuilding, options, query, clear, loadOptions } = filtersApi;



  const filters = useMemo(() => {

    const f = { ...query };

    if (status) f.status = status;

    return f;

  }, [query, status]);



  const { units, loading, error, refresh, createUnit } = useUnits(filters);



  const breachCount = units.filter((u) => u.slaBreachCount > 0).length;



  const loadV1Status = async () => {

    try {

      setV1Status(await postSalesApi.getV1InventoryStatus());

    } catch {

      setV1Status(null);

    }

  };



  useEffect(() => { loadV1Status(); }, []);



  const handleSyncV1 = async (dryRun = false) => {

    setSyncing(true);

    setSyncMsg('');

    try {

      const r = await postSalesApi.syncFromCashflowV1({ project: project || undefined, dryRun });

      setSyncMsg(

        dryRun

          ? `Preview: ${r.created} new, ${r.updated} updates${project ? ` (${project})` : ''}`

          : `Synced from Cashflow V1: ${r.created} created, ${r.updated} updated${r.errors?.length ? `, ${r.errors.length} errors` : ''}`

      );

      await refresh();

      await loadV1Status();

      await loadOptions();

    } catch (e) {

      setSyncMsg(e.message);

    } finally {

      setSyncing(false);

    }

  };



  return (

    <div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>

        <div>

          <h2 style={{ margin: 0 }}>Sold Units</h2>

          {v1Status?.available && (

            <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'var(--ps-text-muted)' }}>

              Cashflow V1: {v1Status.v1SoldCount} sold · Post Sales: {v1Status.postSalesCount} tracked · {v1Status.linkedCount} linked

            </p>

          )}

        </div>

        <button type="button" className="ps-btn ps-btn-primary" onClick={() => setShowModal(true)}>+ New unit</button>

      </div>



      <PostSalesFilterBar

        project={project}

        phase={phase}

        building={building}

        onProjectChange={setProject}

        onPhaseChange={setPhase}

        onBuildingChange={setBuilding}

        options={options}

        onClear={clear}

        extra={(

          <>

            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">

              <option value="">All statuses</option>

              <option value="active">Active</option>

              <option value="possession_given">Possession given</option>

              <option value="on_hold">On hold</option>

              <option value="cancelled">Cancelled</option>

            </select>

            <button type="button" className="ps-btn" disabled={syncing} onClick={() => handleSyncV1(true)}>Preview V1 sync</button>

            <button type="button" className="ps-btn ps-btn-primary" disabled={syncing} onClick={() => handleSyncV1(false)}>

              {syncing ? 'Syncing…' : 'Sync from Cashflow V1'}

            </button>

            <span style={{ fontSize: '0.85rem' }}>{units.length} units · {breachCount} with breaches</span>

          </>

        )}

      />



      {syncMsg && <div className="ps-card" style={{ background: 'var(--ps-accent-soft)', fontSize: '0.9rem' }}>{syncMsg}</div>}

      {error && <div className="ps-error">{error}</div>}

      {loading && <div className="ps-empty">Loading units…</div>}



      {!loading && !units.length && (

        <div className="ps-empty">

          No units match these filters. Try <strong>Sync from Cashflow V1</strong> to import sold inventory by project.

        </div>

      )}



      <div className="ps-unit-grid">

        {units.map((u) => (

          <Link key={u._id} to={`/app/post-sales/units/${u._id}`} className="ps-unit-card">

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>

              <strong>{u.project} · {u.unitNumber}</strong>

              {u.slaBreachCount > 0 && <span className="ps-badge ps-badge-red">{u.slaBreachCount} breach</span>}

            </div>

            <div style={{ fontSize: '0.85rem', marginTop: 4 }}>{u.customerName || u.customer?.name}</div>

            <div style={{ fontSize: '0.75rem', color: 'var(--ps-text-muted)', marginTop: 4 }}>

              {[u.phase, u.building || u.tower].filter(Boolean).join(' · ') || '—'}

              {' · '}{u.entity} · Step {u.currentStepNumber}/20

            </div>

            <div className="ps-pipeline-dots">

              {(u.steps || []).map((s) => (

                <span key={s.stepNumber} className={`ps-dot ${dotClass(s.status)}`} title={`Step ${s.stepNumber}: ${s.status}`} />

              ))}

            </div>

            <div style={{ fontSize: '0.75rem', marginTop: 8, color: 'var(--ps-text-muted)' }}>

              Booked {u.bookingDate ? new Date(u.bookingDate).toLocaleDateString('en-IN') : '—'} · {fmt(u.totalCost)}

            </div>

          </Link>

        ))}

      </div>



      {showModal && (

        <NewUnitModal

          onClose={() => setShowModal(false)}

          onSubmit={async (customer, unit) => {

            await createUnit(customer, unit);

            setShowModal(false);

          }}

        />

      )}

    </div>

  );

}

