import cron from 'node-cron';
import HiringCandidate from '../models/hiring/Candidate.js';
import HiringRequisition from '../models/hiring/Requisition.js';
import { ensureHiringMongoose } from '../lib/hiring/mongoose.js';
import { pushFeedback, metaviewConfigured } from '../lib/hiring/metaviewService.js';

export function startHiringMetaviewRetry() {
  ensureHiringMongoose().then(() => {
    cron.schedule('*/15 * * * *', async () => {
      if (!metaviewConfigured()) return;
      try {
        const candidates = await HiringCandidate.find({
          isDeleted: false,
          metaviewCandidateId: { $ne: null },
          'feedbackHistory.syncedToMetaview': false
        }).limit(50);

        for (const cand of candidates) {
          const pending = (cand.feedbackHistory || []).filter((f) => !f.syncedToMetaview);
          if (!pending.length) continue;
          const reqDoc = await HiringRequisition.findById(cand.requisitionId).lean();
          if (!reqDoc?.metaviewSearchId) continue;
          for (const entry of pending) {
            try {
              await pushFeedback(reqDoc.metaviewSearchId, cand.metaviewCandidateId, entry.verdict, entry.note);
              entry.syncedToMetaview = true;
            } catch (err) {
              console.warn('[hiring] Metaview feedback retry failed:', err.message);
            }
          }
          cand.markModified('feedbackHistory');
          await cand.save();
        }
      } catch (err) {
        console.error('[hiring] Metaview retry job error:', err.message);
      }
    });
    console.log('[Hiring] Metaview feedback retry cron scheduled (every 15 min)');
  }).catch((err) => {
    console.warn('[Hiring] Metaview retry cron failed to start:', err.message);
  });
}
