import cron from 'node-cron';
import PipelineStep from '../models/postsales/PipelineStep.js';
import Ticket from '../models/postsales/Ticket.js';
import Demand from '../models/postsales/Demand.js';
import { ensurePostSalesMongoose } from '../lib/postsales/mongoose.js';

export function startSlaMonitor() {
  ensurePostSalesMongoose().then(() => {
    cron.schedule('0 * * * *', async () => {
      const now = new Date();

      await PipelineStep.updateMany(
        { status: 'in_progress', dueDate: { $lt: now }, slaBreach: false },
        { $set: { slaBreach: true, status: 'overdue' } }
      );

      const breachedSteps = await PipelineStep.find({ status: { $in: ['in_progress', 'overdue'] }, slaBreach: true });
      for (const step of breachedSteps) {
        if (!step.dueDate) continue;
        const days = Math.floor((now - step.dueDate) / (1000 * 60 * 60 * 24));
        await PipelineStep.findByIdAndUpdate(step._id, { slaBreachDays: days, status: 'overdue' });
      }

      const ackThreshold = new Date(now - 24 * 60 * 60 * 1000);
      await Ticket.updateMany(
        { status: 'open', acknowledgedAt: null, raisedAt: { $lt: ackThreshold }, ackSlaBreach: false },
        { $set: { ackSlaBreach: true } }
      );

      const resThreshold = new Date(now - 7 * 24 * 60 * 60 * 1000);
      await Ticket.updateMany(
        { status: { $nin: ['resolved', 'closed'] }, raisedAt: { $lt: resThreshold }, resolutionSlaBreach: false },
        { $set: { resolutionSlaBreach: true } }
      );

      await Demand.updateMany(
        { paymentStatus: { $in: ['pending', 'partial'] }, dueDate: { $lt: now } },
        { $set: { paymentStatus: 'overdue' } }
      );

      console.log(`[SLA Monitor] Ran at ${now.toISOString()}`);
    });
    console.log('[SLA Monitor] Scheduled hourly');
  }).catch((err) => {
    console.warn('[SLA Monitor] Failed to start:', err.message);
  });
}
