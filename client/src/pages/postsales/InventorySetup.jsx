import { useCallback, useEffect, useState } from 'react';
import { ENTITIES } from '../../data/postsales/steps.js';
import { postSalesApi } from '../../lib/postSalesApi.js';

function RowActions({ onSave, onDelete, onCancel, saving }) {
  return (
    <div className="ps-inline-form">
      <button type="button" className="ps-btn ps-btn-primary" disabled={saving} onClick={onSave}>Save</button>
      <button type="button" className="ps-btn" onClick={onCancel}>Cancel</button>
      {onDelete && (
        <button type="button" className="ps-btn ps-btn-danger" disabled={saving} onClick={onDelete}>Delete</button>
      )}
    </div>
  );
}

export default function InventorySetup() {
  const [catalog, setCatalog] = useState({ projects: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(new Set());
  const [showAddProject, setShowAddProject] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', entity: 'GAPL', location: '', phase: '', building: '' });
  const [edit, setEdit] = useState(null);
  const [addChild, setAddChild] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await postSalesApi.getInventoryCatalog();
      setCatalog(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const run = async (fn, success) => {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const data = await fn();
      setCatalog(data);
      setMsg(success);
      setEdit(null);
      setAddChild(null);
      setShowAddProject(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleAddProject = () => run(
    () => postSalesApi.addCatalogProject(addForm),
    `Added project "${addForm.name}"`,
  );

  const handleImportV1 = () => run(
    () => postSalesApi.importCatalogFromV1(),
    'Imported hierarchy from Cashflow V1',
  );

  const handlePushV1 = () => run(
    () => postSalesApi.pushCatalogToV1(),
    'Pushed hierarchy to Cashflow V1',
  );

  return (
    <div className="ps-inventory-page">
      <div className="ps-demands-head">
        <div>
          <h2 style={{ margin: 0 }}>Project · Phase · Building</h2>
          <p className="ps-demands-sub">
            Same hierarchy as Cashflow V1 — add, rename, or remove entries. Filters across Post Sales use this catalog.
          </p>
        </div>
        <div className="ps-demands-actions">
          <button type="button" className="ps-btn ps-btn-primary" onClick={() => setShowAddProject(true)}>+ Add project</button>
          <button type="button" className="ps-btn" disabled={busy} onClick={handleImportV1}>Import from V1</button>
          <button type="button" className="ps-btn" disabled={busy} onClick={handlePushV1}>Push to V1</button>
        </div>
      </div>

      {msg && <div className="ps-card" style={{ padding: '10px 14px', background: 'var(--ps-success-bg)', fontSize: '0.9rem' }}>{msg}</div>}
      {error && <div className="ps-error">{error}</div>}
      {loading && <div className="ps-empty">Loading catalog…</div>}

      {showAddProject && (
        <div className="ps-card ps-demands-upload">
          <strong>Add project</strong>
          <div className="ps-grid-2" style={{ marginTop: 12 }}>
            <div className="ps-form-group"><label>Project name *</label><input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Golden HQ" /></div>
            <div className="ps-form-group">
              <label>Entity</label>
              <select value={addForm.entity} onChange={(e) => setAddForm((f) => ({ ...f, entity: e.target.value }))}>
                {ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className="ps-form-group"><label>Location</label><input value={addForm.location} onChange={(e) => setAddForm((f) => ({ ...f, location: e.target.value }))} /></div>
            <div className="ps-form-group"><label>First phase (optional)</label><input value={addForm.phase} onChange={(e) => setAddForm((f) => ({ ...f, phase: e.target.value }))} placeholder="Phase 1" /></div>
            <div className="ps-form-group"><label>First building (optional)</label><input value={addForm.building} onChange={(e) => setAddForm((f) => ({ ...f, building: e.target.value }))} placeholder="Tower A" /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className="ps-btn ps-btn-primary" disabled={busy || !addForm.name.trim()} onClick={handleAddProject}>Add project</button>
            <button type="button" className="ps-btn" onClick={() => setShowAddProject(false)}>Cancel</button>
          </div>
        </div>
      )}

      {!loading && !catalog.projects?.length && (
        <div className="ps-card ps-empty">
          <p>No projects in catalog yet.</p>
          <p style={{ fontSize: '0.9rem' }}>Add a project manually or import from Cashflow V1.</p>
        </div>
      )}

      {!loading && catalog.projects?.map((p) => {
        const open = expanded.has(p.name);
        return (
          <div key={p.name} className="ps-card ps-inventory-project">
            <div className="ps-inventory-row" onClick={() => toggle(p.name)}>
              <span>{open ? '▼' : '▶'}</span>
              <div style={{ flex: 1 }}>
                {edit?.type === 'project' && edit.project === p.name ? (
                  <div className="ps-grid-2" onClick={(e) => e.stopPropagation()}>
                    <input value={edit.name} onChange={(e) => setEdit((x) => ({ ...x, name: e.target.value }))} />
                    <select value={edit.entity} onChange={(e) => setEdit((x) => ({ ...x, entity: e.target.value }))}>
                      {ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
                    </select>
                    <RowActions
                      saving={busy}
                      onCancel={() => setEdit(null)}
                      onSave={() => run(
                        () => postSalesApi.updateCatalogProject({ oldName: p.name, name: edit.name, entity: edit.entity, location: edit.location }),
                        'Project updated',
                      )}
                      onDelete={() => {
                        if (!window.confirm(`Delete project "${p.name}"?${p.unitCount ? ` ${p.unitCount} unit(s) linked.` : ''}`)) return;
                        run(() => postSalesApi.deleteCatalogProject(p.name, !!p.unitCount), 'Project removed');
                      }}
                    />
                  </div>
                ) : (
                  <>
                    <strong>{p.name}</strong>
                    <span className="ps-demands-meta"> · {p.entity}{p.location ? ` · ${p.location}` : ''} · {p.unitCount || 0} unit(s)</span>
                  </>
                )}
              </div>
              {!edit && (
                <div className="ps-inventory-row-actions" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="ps-btn" style={{ fontSize: '0.75rem' }} onClick={() => setEdit({ type: 'project', project: p.name, name: p.name, entity: p.entity, location: p.location || '' })}>Edit</button>
                  <button type="button" className="ps-btn" style={{ fontSize: '0.75rem' }} onClick={() => setAddChild({ type: 'phase', project: p.name, name: '' })}>+ Phase</button>
                </div>
              )}
            </div>

            {open && (
              <div className="ps-inventory-tree">
                {addChild?.type === 'phase' && addChild.project === p.name && (
                  <div className="ps-inventory-add-row">
                    <input placeholder="Phase name" value={addChild.name} onChange={(e) => setAddChild((x) => ({ ...x, name: e.target.value }))} />
                    <button type="button" className="ps-btn ps-btn-primary" disabled={busy} onClick={() => run(() => postSalesApi.addCatalogPhase({ project: p.name, name: addChild.name }), 'Phase added')}>Add</button>
                    <button type="button" className="ps-btn" onClick={() => setAddChild(null)}>Cancel</button>
                  </div>
                )}

                {(p.phases || []).map((ph) => (
                  <div key={`${p.name}-${ph.name}`} className="ps-inventory-phase">
                    <div className="ps-inventory-row ps-inventory-row-nested">
                      {edit?.type === 'phase' && edit.project === p.name && edit.phase === ph.name ? (
                        <div className="ps-inventory-add-row" style={{ flex: 1 }}>
                          <input value={edit.name} onChange={(e) => setEdit((x) => ({ ...x, name: e.target.value }))} />
                          <RowActions
                            saving={busy}
                            onCancel={() => setEdit(null)}
                            onSave={() => run(
                              () => postSalesApi.updateCatalogPhase({ project: p.name, oldName: ph.name, name: edit.name }),
                              'Phase updated',
                            )}
                            onDelete={() => {
                              if (!window.confirm(`Delete phase "${ph.name}"?`)) return;
                              run(() => postSalesApi.deleteCatalogPhase(p.name, ph.name, !!ph.unitCount), 'Phase removed');
                            }}
                          />
                        </div>
                      ) : (
                        <>
                          <strong>{ph.name}</strong>
                          <span className="ps-demands-meta"> · {ph.unitCount || 0} unit(s)</span>
                          <div className="ps-inventory-row-actions">
                            <button type="button" className="ps-btn" style={{ fontSize: '0.75rem' }} onClick={() => setEdit({ type: 'phase', project: p.name, phase: ph.name, name: ph.name })}>Edit</button>
                            <button type="button" className="ps-btn" style={{ fontSize: '0.75rem' }} onClick={() => setAddChild({ type: 'building', project: p.name, phase: ph.name, name: '' })}>+ Building</button>
                          </div>
                        </>
                      )}
                    </div>

                    {addChild?.type === 'building' && addChild.project === p.name && addChild.phase === ph.name && (
                      <div className="ps-inventory-add-row ps-inventory-row-nested2">
                        <input placeholder="Building / tower" value={addChild.name} onChange={(e) => setAddChild((x) => ({ ...x, name: e.target.value }))} />
                        <button type="button" className="ps-btn ps-btn-primary" disabled={busy} onClick={() => run(() => postSalesApi.addCatalogBuilding({ project: p.name, phase: ph.name, name: addChild.name }), 'Building added')}>Add</button>
                        <button type="button" className="ps-btn" onClick={() => setAddChild(null)}>Cancel</button>
                      </div>
                    )}

                    <div className="ps-inventory-buildings">
                      {(ph.buildings || []).map((b) => (
                        <div key={`${p.name}-${ph.name}-${b.name}`} className="ps-inventory-building">
                          {edit?.type === 'building' && edit.project === p.name && edit.phase === ph.name && edit.building === b.name ? (
                            <div className="ps-inventory-add-row">
                              <input value={edit.name} onChange={(e) => setEdit((x) => ({ ...x, name: e.target.value }))} />
                              <RowActions
                                saving={busy}
                                onCancel={() => setEdit(null)}
                                onSave={() => run(
                                  () => postSalesApi.updateCatalogBuilding({ project: p.name, phase: ph.name, oldName: b.name, name: edit.name }),
                                  'Building updated',
                                )}
                                onDelete={() => {
                                  if (!window.confirm(`Delete building "${b.name}"?`)) return;
                                  run(() => postSalesApi.deleteCatalogBuilding(p.name, ph.name, b.name, !!b.unitCount), 'Building removed');
                                }}
                              />
                            </div>
                          ) : (
                            <>
                              <span>{b.name}</span>
                              <span className="ps-demands-meta">({b.unitCount || 0})</span>
                              <button type="button" className="ps-btn" style={{ fontSize: '0.7rem', marginLeft: 8 }} onClick={() => setEdit({ type: 'building', project: p.name, phase: ph.name, building: b.name, name: b.name })}>Edit</button>
                            </>
                          )}
                        </div>
                      ))}
                      {!ph.buildings?.length && <div className="ps-demands-meta" style={{ padding: '4px 0 4px 24px' }}>No buildings yet</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <p style={{ fontSize: '0.8rem', color: 'var(--ps-text-muted)', marginTop: 16 }}>
        Renaming updates linked sold units automatically. Delete is blocked while units are assigned — use force via API if needed.
        Import reads Cashflow V1 sold inventory + manual projects; Push writes hierarchy back to V1.
      </p>
    </div>
  );
}
