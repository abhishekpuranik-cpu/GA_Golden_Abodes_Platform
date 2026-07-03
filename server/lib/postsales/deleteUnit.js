import Customer from '../../models/postsales/Customer.js';
import Unit from '../../models/postsales/Unit.js';
import PipelineStep from '../../models/postsales/PipelineStep.js';
import Demand from '../../models/postsales/Demand.js';
import Document from '../../models/postsales/Document.js';
import ClpLetterTask from '../../models/postsales/ClpLetterTask.js';
import CollectionForecast from '../../models/postsales/CollectionForecast.js';
import LoanTracker from '../../models/postsales/LoanTracker.js';
import Ticket from '../../models/postsales/Ticket.js';
import PossessionClearance from '../../models/postsales/PossessionClearance.js';
import DisbursementTask from '../../models/postsales/DisbursementTask.js';

/** Remove one sold unit and all related post-sales records. */
export async function deleteSingleUnit(unitId) {
  const unit = await Unit.findById(unitId).lean();
  if (!unit) throw new Error('Unit not found');

  const uid = unit._id;
  const [
    steps,
    demands,
    documents,
    clpTasks,
    forecasts,
    loans,
    tickets,
    possession,
    disbursements,
  ] = await Promise.all([
    PipelineStep.deleteMany({ unitId: uid }),
    Demand.deleteMany({ unitId: uid }),
    Document.deleteMany({ unitId: uid }),
    ClpLetterTask.deleteMany({ unitId: uid }),
    CollectionForecast.deleteMany({ unitId: uid }),
    LoanTracker.deleteMany({ unitId: uid }),
    Ticket.deleteMany({ unitId: uid }),
    PossessionClearance.deleteMany({ unitId: uid }),
    DisbursementTask.deleteMany({ unitId: uid }),
  ]);

  await Unit.findByIdAndDelete(uid);

  let customerDeleted = false;
  if (unit.customerId) {
    const others = await Unit.countDocuments({ customerId: unit.customerId });
    if (others === 0) {
      await Customer.findByIdAndDelete(unit.customerId);
      customerDeleted = true;
    }
  }

  return {
    ok: true,
    unitNumber: unit.unitNumber,
    project: unit.project,
    deleted: {
      pipelineSteps: steps.deletedCount,
      demands: demands.deletedCount,
      documents: documents.deletedCount,
      clpLetterTasks: clpTasks.deletedCount,
      forecasts: forecasts.deletedCount,
      loans: loans.deletedCount,
      tickets: tickets.deletedCount,
      possessionClearances: possession.deletedCount,
      disbursementTasks: disbursements.deletedCount,
      customer: customerDeleted ? 1 : 0,
    },
  };
}
