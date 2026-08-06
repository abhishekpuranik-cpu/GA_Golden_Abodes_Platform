import fs from 'fs';

const seedUrl = new URL('./preconDrawingCatalogSeed.json', import.meta.url);
const seed = JSON.parse(fs.readFileSync(seedUrl, 'utf8'));

export const DRAWING_CATALOG_COLLECTION = 'precon_drawing_catalog';
export const DRAWING_PLAN_COLLECTION = 'precon_drawing_plan';

const META_ID = '__catalog_meta__';
/** Legacy stage labels merged into MEP GFCs (seed v2+). */
export const LEGACY_MEP_GFC_STAGES = [
  '06. Plumbing, Public Health & Firefighting GFC / Execution',
  '07. Electrical & ELV GFC / Execution'
];
export const MEP_GFC_STAGE = '05. MEP GFCs';

let drawingCatalogIndexesPromise = null;

function cleanText(value, max = 300) {
  return String(value || '').trim().slice(0, max);
}

export function ensureDrawingCatalogIndexes(db) {
  if (!drawingCatalogIndexesPromise) {
    drawingCatalogIndexesPromise = Promise.all([
      db.collection(DRAWING_CATALOG_COLLECTION).createIndex(
        { deletedAt: 1, stageOrder: 1, sourceOrder: 1, drawingOrder: 1 },
        { name: 'catalog_tree_order' }
      ),
      db.collection(DRAWING_PLAN_COLLECTION).createIndex(
        { projectId: 1, catalogItemId: 1 },
        { name: 'drawing_plan_project' }
      )
    ]).catch((error) => {
      drawingCatalogIndexesPromise = null;
      throw error;
    });
  }
  return drawingCatalogIndexesPromise;
}

/**
 * Apply seed stage renames when seed.version advances.
 * Initial seed only inserts once — migrations keep live Mongo aligned.
 */
export async function migrateDrawingCatalogSeed(db) {
  const col = db.collection(DRAWING_CATALOG_COLLECTION);
  const target = Number(seed.version || 1);
  const meta = await col.findOne({ _id: META_ID });
  const current = Number(meta?.seedVersion || 0);
  if (current >= target) return { skipped: true, current, target };

  const now = new Date();
  const ops = (seed.items || []).map((item) => ({
    updateOne: {
      filter: { _id: item.id },
      update: {
        $set: {
          id: item.id,
          stage: item.stage,
          stageOrder: item.stageOrder,
          source: item.source,
          sourceOrder: item.sourceOrder,
          drawingName: item.drawingName,
          drawingOrder: item.drawingOrder,
          seedVersion: target,
          updatedAt: now
        },
        $setOnInsert: {
          _id: item.id,
          createdAt: now
        }
      },
      upsert: true
    }
  }));
  if (ops.length) await col.bulkWrite(ops, { ordered: false });

  await db.collection('precon_attachments').updateMany(
    { scope: 'drawing', stage: { $in: LEGACY_MEP_GFC_STAGES } },
    { $set: { stage: MEP_GFC_STAGE } }
  );

  await col.updateOne(
    { _id: META_ID },
    {
      $set: {
        seedVersion: target,
        source: seed.source || '',
        migratedAt: now,
        notes: seed.notes || ''
      },
      $setOnInsert: { _id: META_ID, seededAt: now }
    },
    { upsert: true }
  );
  return { skipped: false, from: current, to: target, items: ops.length };
}

export async function ensureDrawingCatalog(db) {
  const col = db.collection(DRAWING_CATALOG_COLLECTION);
  const meta = await col.findOne({ _id: META_ID });
  if (!meta) {
    const now = new Date();
    const ops = (seed.items || []).map((item) => ({
      updateOne: {
        filter: { _id: item.id },
        update: {
          $setOnInsert: {
            _id: item.id,
            ...item,
            seedVersion: seed.version || 1,
            createdAt: now,
            updatedAt: now
          }
        },
        upsert: true
      }
    }));
    ops.push({
      updateOne: {
        filter: { _id: META_ID },
        update: {
          $setOnInsert: {
            _id: META_ID,
            seedVersion: seed.version || 1,
            source: seed.source || '',
            seededAt: now
          }
        },
        upsert: true
      }
    });
    await col.bulkWrite(ops, { ordered: false });
  }
  await migrateDrawingCatalogSeed(db);
}

export async function listDrawingCatalog(db, { includeDeleted = false } = {}) {
  await ensureDrawingCatalog(db);
  const query = { _id: { $ne: META_ID } };
  if (!includeDeleted) query.deletedAt = { $exists: false };
  return db
    .collection(DRAWING_CATALOG_COLLECTION)
    .find(query)
    .sort({ stageOrder: 1, sourceOrder: 1, drawingOrder: 1, drawingName: 1 })
    .toArray();
}

export async function addDrawingCatalogItem(db, raw, actor) {
  await ensureDrawingCatalog(db);
  const stage = cleanText(raw.stage);
  const source = cleanText(raw.source);
  const drawingName = cleanText(raw.drawingName);
  if (!stage || !source || !drawingName) throw new Error('Stage, source, and drawing name are required');
  const col = db.collection(DRAWING_CATALOG_COLLECTION);
  const [lastStage, lastStageSource, lastDrawing, duplicate] = await Promise.all([
    col.find({ deletedAt: { $exists: false } }).sort({ stageOrder: -1 }).limit(1).next(),
    col.find({ stage, deletedAt: { $exists: false } }).sort({ sourceOrder: -1 }).limit(1).next(),
    col.find({ stage, source, deletedAt: { $exists: false } }).sort({ drawingOrder: -1 }).limit(1).next(),
    col.findOne({
      stage: { $regex: `^${stage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      source: { $regex: `^${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      drawingName: { $regex: `^${drawingName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      deletedAt: { $exists: false },
    }),
  ]);
  if (duplicate) throw new Error('This drawing already exists in the selected stage and source');
  const existingStage = await col.findOne({ stage, deletedAt: { $exists: false } });
  const now = new Date();
  const id = `cat_custom_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const row = {
    _id: id,
    id,
    stage,
    stageOrder: Number(raw.stageOrder) || existingStage?.stageOrder || Number(lastStage?.stageOrder || 0) + 1,
    source,
    sourceOrder: Number(raw.sourceOrder) || Number(lastDrawing?.sourceOrder || 0) || Number(lastStageSource?.sourceOrder || 0) + 1,
    drawingName,
    drawingOrder: Number(raw.drawingOrder) || Number(lastDrawing?.drawingOrder || 0) + 1,
    createdAt: now,
    updatedAt: now,
    updatedBy: actor,
  };
  await col.insertOne(row);
  return row;
}

export async function updateDrawingCatalogItem(db, id, raw, actor) {
  await ensureDrawingCatalog(db);
  const patch = { updatedAt: new Date(), updatedBy: actor };
  for (const key of ['stage', 'source', 'drawingName']) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      patch[key] = cleanText(raw[key]);
      if (!patch[key]) throw new Error(`${key} cannot be empty`);
    }
  }
  for (const key of ['stageOrder', 'sourceOrder', 'drawingOrder']) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) patch[key] = Math.max(1, Number(raw[key]) || 1);
  }
  const result = await db.collection(DRAWING_CATALOG_COLLECTION).findOneAndUpdate(
    { _id: String(id), deletedAt: { $exists: false } },
    { $set: patch },
    { returnDocument: 'after' }
  );
  if (!result) throw new Error('Catalog drawing not found');
  return result;
}

export async function deleteDrawingCatalogItem(db, id, actor) {
  const result = await db.collection(DRAWING_CATALOG_COLLECTION).updateOne(
    { _id: String(id), deletedAt: { $exists: false } },
    { $set: { deletedAt: new Date(), deletedBy: actor, updatedAt: new Date() } }
  );
  if (!result.matchedCount) throw new Error('Catalog drawing not found');
}

export async function listDrawingPlan(db, projectId) {
  return db.collection(DRAWING_PLAN_COLLECTION).find({ projectId: String(projectId) }).toArray();
}

export async function saveDrawingPlan(db, catalogItemId, raw, actor) {
  const projectId = cleanText(raw.projectId, 120);
  if (!projectId) throw new Error('projectId required');
  const scopeType = ['project', 'phase', 'building', 'amenity'].includes(raw.scopeType)
    ? raw.scopeType
    : 'project';
  const key = `${projectId}:${catalogItemId}:${cleanText(raw.scopeKey || 'project', 180)}`;
  const now = new Date();
  const patch = {
    projectId,
    catalogItemId: String(catalogItemId),
    scopeType,
    scopeKey: cleanText(raw.scopeKey || 'project', 180),
    scopeLabel: cleanText(raw.scopeLabel || '', 200),
    startDate: cleanText(raw.startDate || '', 10),
    endDate: cleanText(raw.endDate || '', 10),
    updatedAt: now,
    updatedBy: actor,
  };
  await db.collection(DRAWING_PLAN_COLLECTION).updateOne(
    { _id: key },
    { $set: patch, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );
  return { id: key, ...patch };
}
