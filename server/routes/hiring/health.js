import { Router } from 'express';
import HiringCandidate from '../../models/hiring/Candidate.js';
import { sourcingModeAvailable, metaviewConfigured } from '../../lib/hiring/metaviewService.js';
import { notDeletedFilter } from '../../lib/hiring/validate.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const pendingMetaviewSyncs = await HiringCandidate.countDocuments({
      ...notDeletedFilter(),
      metaviewCandidateId: { $ne: null },
      feedbackHistory: { $elemMatch: { syncedToMetaview: false } }
    });
    res.json({
      ok: true,
      sourcingMode: sourcingModeAvailable(),
      metaviewConfigured: metaviewConfigured(),
      pendingMetaviewSyncs
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
