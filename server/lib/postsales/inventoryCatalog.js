import Unit from '../../models/postsales/Unit.js';
import ConstructionMilestone from '../../models/postsales/ConstructionMilestone.js';
import { loadCashflowEnvelope } from '../dmGovernance/integrations/appStateReader.js';
import { packV1CashflowRowData, repairV1CashflowForRead } from '../v1CashflowMongoPack.js';
import { extractV1SoldInventory } from './cashflowV1Sync.js';
import { POST_SALES_PROJECTS } from './projectMap.js';
import { PROJECTS as DEFAULT_PROJECTS } from './steps.js';

const CATALOG_ID = 'inventory_catalog';

function norm(s) {
  return String(s || '').trim();
}

function slug(s) {
  return norm(s).toLowerCase();
}

function emptyPhase(name = 'Default') {
  return { name: norm(name) || 'Default', buildings: [] };
}

function ensureProjectShape(p) {
  const name = norm(p?.name);
  if (!name) return null;
  const phases = Array.isArray(p.phases) && p.phases.length
    ? p.phases.map((ph) => ({
      name: norm(ph?.name) || 'Default',
      buildings: [...new Set((ph?.buildings || []).map(norm).filter(Boolean))].sort(),
    }))
    : [emptyPhase('Default')];
  return {
    name,
    entity: norm(p?.entity) || 'GAPL',
    location: norm(p?.location) || '',
    v1ProjectId: norm(p?.v1ProjectId) || undefined,
    phases,
  };
}

function mergePhaseBuilding(existing, phaseName, buildingName) {
  const phase = norm(phaseName);
  const building = norm(buildingName);
  let phases = [...(existing.phases || [])];
  if (phase) {
    let ph = phases.find((x) => slug(x.name) === slug(phase));
    if (!ph) {
      ph = { name: phase, buildings: [] };
      phases.push(ph);
    }
    if (building && !ph.buildings.some((b) => slug(b) === slug(building))) {
      ph.buildings.push(building);
      ph.buildings.sort();
    }
  } else if (building) {
    let ph = phases.find((x) => slug(x.name) === slug('default')) || phases[0];
    if (!ph) {
      ph = emptyPhase('Default');
      phases.push(ph);
    }
    if (!ph.buildings.some((b) => slug(b) === slug(building))) {
      ph.buildings.push(building);
      ph.buildings.sort();
    }
  }
  return { ...existing, phases };
}

export async function loadInventoryCatalog(db) {
  const doc = await db.collection('post_sales_settings').findOne({ _id: CATALOG_ID });
  if (doc?.projects?.length) {
    return {
      projects: doc.projects.map(ensureProjectShape).filter(Boolean),
      updatedAt: doc.updatedAt || null,
    };
  }
  return seedInventoryCatalog(db);
}

async function seedInventoryCatalog(db) {
  const byName = new Map();

  for (const p of DEFAULT_PROJECTS) {
    byName.set(slug(p.name), ensureProjectShape(p));
  }

  const units = await Unit.find({}, { project: 1, phase: 1, building: 1, tower: 1 }).lean();
  for (const u of units) {
    const name = norm(u.project);
    if (!name) continue;
    const key = slug(name);
    const base = byName.get(key) || ensureProjectShape({ name, entity: 'GAPL', phases: [] });
    byName.set(key, mergePhaseBuilding(base, u.phase, u.building || u.tower));
  }

  try {
    const envelope = await loadCashflowEnvelope(db);
    if (envelope) {
      for (const row of extractV1SoldInventory(envelope)) {
        const key = slug(row.project);
        const base = byName.get(key) || ensureProjectShape({ name: row.project, entity: row.entity, phases: [] });
        byName.set(key, mergePhaseBuilding({ ...base, v1ProjectId: row.v1ProjectId }, row.phase, row.building));
      }
      for (const mp of envelope.manualProjs || []) {
        const name = norm(mp.name);
        if (!name) continue;
        const key = slug(name);
        const mapped = POST_SALES_PROJECTS.find((p) => slug(p.name) === slug(name));
        const base = byName.get(key) || ensureProjectShape({
          name: mapped?.name || name,
          entity: mapped?.entity || 'GAPL',
          phases: [],
          v1ProjectId: mp.id,
        });
        byName.set(key, mergePhaseBuilding({
          ...base,
          v1ProjectId: base.v1ProjectId || mp.id,
        }, mp.phase, mp.building));
      }
    }
  } catch {
    /* optional */
  }

  const catalog = { projects: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)) };
  await saveInventoryCatalog(db, catalog);
  return catalog;
}

export async function saveInventoryCatalog(db, catalog) {
  const projects = (catalog.projects || []).map(ensureProjectShape).filter(Boolean);
  const payload = { projects, updatedAt: new Date() };
  await db.collection('post_sales_settings').updateOne(
    { _id: CATALOG_ID },
    { $set: payload },
    { upsert: true },
  );
  return payload;
}

export function catalogFilterOptions(catalog, { project, phase } = {}) {
  const projects = (catalog.projects || []).map((p) => p.name).sort();
  let phases = [];
  let buildings = [];

  if (project) {
    const row = (catalog.projects || []).find((p) => p.name === project);
    phases = (row?.phases || []).map((ph) => ph.name).sort();
    if (phase) {
      const ph = (row?.phases || []).find((x) => x.name === phase);
      buildings = (ph?.buildings || []).slice().sort();
    } else {
      buildings = [...new Set((row?.phases || []).flatMap((ph) => ph.buildings || []))].sort();
    }
  }

  return { projects, phases, buildings };
}

export async function getCatalogWithCounts(db) {
  const catalog = await loadInventoryCatalog(db);
  const unitCounts = await Unit.aggregate([
    { $group: { _id: { project: '$project', phase: '$phase', building: { $ifNull: ['$building', '$tower'] } }, n: { $sum: 1 } } },
  ]);
  const countMap = {};
  for (const row of unitCounts) {
    const p = norm(row._id?.project);
    const ph = norm(row._id?.phase) || '—';
    const b = norm(row._id?.building) || '—';
    if (!countMap[p]) countMap[p] = { total: 0, phases: {} };
    countMap[p].total += row.n;
    if (!countMap[p].phases[ph]) countMap[p].phases[ph] = { total: 0, buildings: {} };
    countMap[p].phases[ph].total += row.n;
    countMap[p].phases[ph].buildings[b] = row.n;
  }

  const projects = catalog.projects.map((p) => ({
    ...p,
    unitCount: countMap[p.name]?.total || 0,
    phases: p.phases.map((ph) => ({
      ...ph,
      unitCount: countMap[p.name]?.phases[ph.name]?.total || 0,
      buildings: ph.buildings.map((b) => ({
        name: b,
        unitCount: countMap[p.name]?.phases[ph.name]?.buildings[b] || 0,
      })),
    })),
  }));

  return { projects, updatedAt: catalog.updatedAt };
}

function findProject(catalog, name) {
  return (catalog.projects || []).find((p) => slug(p.name) === slug(name));
}

async function persist(db, catalog) {
  await saveInventoryCatalog(db, catalog);
  return getCatalogWithCounts(db);
}

export async function addCatalogProject(db, body) {
  const name = norm(body.name);
  if (!name) throw new Error('Project name is required');

  const catalog = await loadInventoryCatalog(db);
  if (findProject(catalog, name)) throw new Error(`Project "${name}" already exists`);

  const row = mergePhaseBuilding(ensureProjectShape({
    name,
    entity: body.entity,
    location: body.location,
    phases: [],
  }), body.phase, body.building);

  catalog.projects.push(row);
  catalog.projects.sort((a, b) => a.name.localeCompare(b.name));
  return persist(db, catalog);
}

export async function updateCatalogProject(db, oldName, body) {
  const catalog = await loadInventoryCatalog(db);
  const project = findProject(catalog, oldName);
  if (!project) throw new Error(`Project "${oldName}" not found`);

  const newName = norm(body.name) || project.name;
  if (slug(newName) !== slug(oldName) && findProject(catalog, newName)) {
    throw new Error(`Project "${newName}" already exists`);
  }

  project.name = newName;
  if (body.entity != null) project.entity = norm(body.entity) || project.entity;
  if (body.location != null) project.location = norm(body.location);

  if (slug(newName) !== slug(oldName)) {
    await Unit.updateMany({ project: oldName }, { $set: { project: newName } });
    await ConstructionMilestone.updateMany({ project: oldName }, { $set: { project: newName } });
  }

  catalog.projects = catalog.projects.map((p) => (slug(p.name) === slug(newName) ? project : p));
  catalog.projects.sort((a, b) => a.name.localeCompare(b.name));
  return persist(db, catalog);
}

export async function deleteCatalogProject(db, name, { force = false } = {}) {
  const catalog = await loadInventoryCatalog(db);
  const project = findProject(catalog, name);
  if (!project) throw new Error(`Project "${name}" not found`);

  const unitCount = await Unit.countDocuments({ project: project.name });
  if (unitCount && !force) {
    throw new Error(`${unitCount} sold unit(s) still use "${project.name}". Remove or reassign them first, or pass force=true.`);
  }

  catalog.projects = catalog.projects.filter((p) => slug(p.name) !== slug(name));
  return persist(db, catalog);
}

export async function addCatalogPhase(db, projectName, phaseName) {
  const name = norm(phaseName);
  if (!name) throw new Error('Phase name is required');

  const catalog = await loadInventoryCatalog(db);
  const project = findProject(catalog, projectName);
  if (!project) throw new Error(`Project "${projectName}" not found`);
  if (project.phases.some((ph) => slug(ph.name) === slug(name))) {
    throw new Error(`Phase "${name}" already exists`);
  }
  project.phases.push({ name, buildings: [] });
  project.phases.sort((a, b) => a.name.localeCompare(b.name));
  return persist(db, catalog);
}

export async function updateCatalogPhase(db, projectName, oldPhase, newPhase) {
  const next = norm(newPhase);
  if (!next) throw new Error('Phase name is required');

  const catalog = await loadInventoryCatalog(db);
  const project = findProject(catalog, projectName);
  if (!project) throw new Error(`Project "${projectName}" not found`);

  const phase = project.phases.find((ph) => slug(ph.name) === slug(oldPhase));
  if (!phase) throw new Error(`Phase "${oldPhase}" not found`);
  if (slug(next) !== slug(oldPhase) && project.phases.some((ph) => slug(ph.name) === slug(next))) {
    throw new Error(`Phase "${next}" already exists`);
  }

  if (slug(next) !== slug(oldPhase)) {
    await Unit.updateMany({ project: project.name, phase: oldPhase }, { $set: { phase: next } });
    phase.name = next;
    project.phases.sort((a, b) => a.name.localeCompare(b.name));
  }

  return persist(db, catalog);
}

export async function deleteCatalogPhase(db, projectName, phaseName, { force = false } = {}) {
  const catalog = await loadInventoryCatalog(db);
  const project = findProject(catalog, projectName);
  if (!project) throw new Error(`Project "${projectName}" not found`);

  const unitCount = await Unit.countDocuments({ project: project.name, phase: phaseName });
  if (unitCount && !force) {
    throw new Error(`${unitCount} unit(s) use phase "${phaseName}". Reassign them first or pass force=true.`);
  }

  project.phases = project.phases.filter((ph) => slug(ph.name) !== slug(phaseName));
  if (!project.phases.length) project.phases.push(emptyPhase('Default'));
  return persist(db, catalog);
}

export async function addCatalogBuilding(db, projectName, phaseName, buildingName) {
  const building = norm(buildingName);
  if (!building) throw new Error('Building name is required');

  const catalog = await loadInventoryCatalog(db);
  const project = findProject(catalog, projectName);
  if (!project) throw new Error(`Project "${projectName}" not found`);

  let phase = project.phases.find((ph) => slug(ph.name) === slug(phaseName));
  if (!phase) {
    phase = { name: norm(phaseName) || 'Default', buildings: [] };
    project.phases.push(phase);
  }
  if (phase.buildings.some((b) => slug(b) === slug(building))) {
    throw new Error(`Building "${building}" already exists`);
  }
  phase.buildings.push(building);
  phase.buildings.sort();
  return persist(db, catalog);
}

export async function updateCatalogBuilding(db, projectName, phaseName, oldBuilding, newBuilding) {
  const next = norm(newBuilding);
  if (!next) throw new Error('Building name is required');

  const catalog = await loadInventoryCatalog(db);
  const project = findProject(catalog, projectName);
  if (!project) throw new Error(`Project "${projectName}" not found`);
  const phase = project.phases.find((ph) => slug(ph.name) === slug(phaseName));
  if (!phase) throw new Error(`Phase "${phaseName}" not found`);

  const idx = phase.buildings.findIndex((b) => slug(b) === slug(oldBuilding));
  if (idx < 0) throw new Error(`Building "${oldBuilding}" not found`);
  if (slug(next) !== slug(oldBuilding) && phase.buildings.some((b) => slug(b) === slug(next))) {
    throw new Error(`Building "${next}" already exists`);
  }

  if (slug(next) !== slug(oldBuilding)) {
    await Unit.updateMany(
      { project: project.name, phase: phase.name, $or: [{ building: oldBuilding }, { tower: oldBuilding }] },
      { $set: { building: next, tower: next } },
    );
    phase.buildings[idx] = next;
    phase.buildings.sort();
  }

  return persist(db, catalog);
}

export async function deleteCatalogBuilding(db, projectName, phaseName, buildingName, { force = false } = {}) {
  const catalog = await loadInventoryCatalog(db);
  const project = findProject(catalog, projectName);
  if (!project) throw new Error(`Project "${projectName}" not found`);
  const phase = project.phases.find((ph) => slug(ph.name) === slug(phaseName));
  if (!phase) throw new Error(`Phase "${phaseName}" not found`);

  const unitCount = await Unit.countDocuments({
    project: project.name,
    phase: phase.name,
    $or: [{ building: buildingName }, { tower: buildingName }],
  });
  if (unitCount && !force) {
    throw new Error(`${unitCount} unit(s) use building "${buildingName}". Reassign them first or pass force=true.`);
  }

  phase.buildings = phase.buildings.filter((b) => slug(b) !== slug(buildingName));
  return persist(db, catalog);
}

export async function importCatalogFromV1(db) {
  const envelope = await loadCashflowEnvelope(db);
  if (!envelope) throw new Error('Cashflow V1 state not found');

  const catalog = await loadInventoryCatalog(db);
  const byName = new Map(catalog.projects.map((p) => [slug(p.name), { ...p }]));

  for (const row of extractV1SoldInventory(envelope)) {
    const key = slug(row.project);
    const base = byName.get(key) || ensureProjectShape({ name: row.project, entity: row.entity, phases: [] });
    byName.set(key, mergePhaseBuilding({ ...base, v1ProjectId: row.v1ProjectId || base.v1ProjectId }, row.phase, row.building));
  }

  for (const mp of envelope.manualProjs || []) {
    const name = norm(mp.name);
    if (!name) continue;
    const mapped = POST_SALES_PROJECTS.find((p) => slug(p.name) === slug(name));
    const key = slug(mapped?.name || name);
    const base = byName.get(key) || ensureProjectShape({
      name: mapped?.name || name,
      entity: mapped?.entity || 'GAPL',
      phases: [],
      v1ProjectId: mp.id,
    });
    byName.set(key, mergePhaseBuilding({
      ...base,
      v1ProjectId: base.v1ProjectId || mp.id,
    }, mp.phase || mp.projectGroup, mp.building));
  }

  catalog.projects = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  return persist(db, catalog);
}

export async function pushCatalogToV1(db) {
  const catalog = await loadInventoryCatalog(db);
  const stateDoc = await db.collection('app_states').findOne({ _id: 'v1_cashflow' });
  if (!stateDoc?.data) throw new Error('Cashflow V1 state not found');

  const envelope = await repairV1CashflowForRead(db, stateDoc.data);
  if (!envelope) throw new Error('Could not read Cashflow V1 envelope');

  const manualProjs = [...(envelope.manualProjs || [])];
  let updated = 0;

  for (const p of catalog.projects) {
    const phase = p.phases?.[0]?.name || '';
    const building = p.phases?.[0]?.buildings?.[0] || '';
    let mp = manualProjs.find((x) => p.v1ProjectId && x.id === p.v1ProjectId)
      || manualProjs.find((x) => slug(x.name) === slug(p.name));

    if (mp) {
      mp.name = p.name;
      mp.projectGroup = p.name;
      mp.phase = phase;
      mp.building = building;
      updated += 1;
    } else {
      const id = p.v1ProjectId || `PS_${slug(p.name).replace(/[^a-z0-9]/g, '')}_${Date.now()}`;
      manualProjs.push({
        id,
        name: p.name,
        projectGroup: p.name,
        phase,
        building,
        status: 'Active',
        on: true,
        _manual: true,
        _fromPostSales: true,
      });
      updated += 1;
    }

    for (const pid of Object.keys(envelope.data || {})) {
      const cfg = envelope.data[pid];
      const cfgName = norm(cfg?.projName);
      if (slug(cfgName) !== slug(p.name)) continue;
      if (phase) cfg.phase = phase;
      if (building) cfg.building = building;
      for (const u of cfg.units || []) {
        if (phase) u.phase = phase;
        if (building) {
          u.building = building;
          u.tower = building;
        }
      }
    }
  }

  envelope.manualProjs = manualProjs;
  const nextVersion = Number(stateDoc.version || 0) + 1;
  const packed = await packV1CashflowRowData(db, envelope, { version: nextVersion, updatedBy: 'post_sales_catalog' });

  await db.collection('app_states').updateOne(
    { _id: 'v1_cashflow' },
    { $set: { data: packed, updatedAt: new Date(), updatedBy: 'post_sales_catalog' }, $inc: { version: 1 } },
  );

  return { ok: true, updated, projectCount: catalog.projects.length };
}
