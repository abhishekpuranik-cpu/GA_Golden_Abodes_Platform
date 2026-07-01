import ClpLetterTask from '../../models/postsales/ClpLetterTask.js';

let repairDone = false;

/**
 * MongoDB sparse-unique on demandId allows only one doc with demandId:null.
 * Milestone-keyed tasks omit demandId — drop unique constraint and clean nulls.
 */
export async function repairClpLetterTaskIndexes() {
  if (repairDone) return;
  const col = ClpLetterTask.collection;

  try {
    const indexes = await col.indexes();
    const demandIdx = indexes.find((i) => i.name === 'demandId_1');
    if (demandIdx?.unique) {
      await col.dropIndex('demandId_1');
    }
  } catch {
    /* index may not exist */
  }

  try {
    await col.createIndex({ demandId: 1 }, { sparse: true, name: 'demandId_1' });
  } catch {
    /* already exists with correct shape */
  }

  try {
    const milestoneIdx = (await col.indexes()).find((i) => i.name === 'unitId_1_milestoneKey_1');
    if (!milestoneIdx?.partialFilterExpression) {
      try { await col.dropIndex('unitId_1_milestoneKey_1'); } catch { /* */ }
      await col.createIndex(
        { unitId: 1, milestoneKey: 1 },
        {
          unique: true,
          name: 'unitId_1_milestoneKey_1',
          partialFilterExpression: {
            milestoneKey: { $exists: true, $type: 'string', $ne: '' },
          },
        },
      );
    }
  } catch (e) {
    console.warn('[clp-letter-task-indexes]', e?.message || e);
  }

  await col.updateMany({ demandId: null }, { $unset: { demandId: '' } });

  repairDone = true;
}

export function resetClpLetterTaskIndexRepairForTests() {
  repairDone = false;
}
