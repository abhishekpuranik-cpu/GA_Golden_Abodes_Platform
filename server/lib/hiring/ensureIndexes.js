import HiringRequisition from '../../models/hiring/Requisition.js';
import HiringCandidate from '../../models/hiring/Candidate.js';

export async function ensureHiringIndexes() {
  try {
    await HiringRequisition.syncIndexes();
    await HiringCandidate.syncIndexes();
    await HiringRequisition.collection.createIndex({ reqCode: 1 }, { unique: true, background: true });
    await HiringCandidate.collection.createIndex(
      { requisitionId: 1, currentStageNumber: 1, isDeleted: 1 },
      { background: true }
    );
    await HiringCandidate.collection.createIndex(
      { metaviewCandidateId: 1, requisitionId: 1 },
      { sparse: true, background: true }
    );
  } catch (err) {
    console.warn('[Hiring] Index ensure skipped:', err.message);
  }
}
