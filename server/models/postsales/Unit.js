import mongoose from 'mongoose';

const UnitSchema = new mongoose.Schema({
  unitNumber: { type: String, required: true },
  tower: String, building: String, floor: Number, carpetArea: Number, saleableArea: Number,
  project: { type: String, required: true },
  entity: { type: String, required: true },
  phase: String,
  v1ProjectId: String, v1UnitKey: String,
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  salesExecutive: String, channelPartner: String,
  bookingDate: Date, bookingAmount: Number, totalCost: Number,
  gstApplicable: Boolean, gstAmount: Number,
  paymentPlan: { type: String, enum: ['CLP','Flexi','Down Payment'] },
  currentStepNumber: { type: Number, default: 1 },
  overallStatus: { type: String, enum: ['active','possession_given','cancelled','on_hold','pending_verification'], default: 'active' },
  agreementDate: Date, registrationDate: Date, possessionDate: Date,
  crmExecutive: String,
  cxExecutive: String,
  backendExecutive: String,
  crmUnitKey: String,
  crmBookingId: String,
  v1UnitKey: String,
  firstImportedAt: Date,
  lastImportBatchId: String,
  /** Set when unit was absent from a CRM dump and marked for verification. */
  crmAbsentBatchId: String,
  crmAbsentNote: String,
  /** Full CLP schedule for this unit only — overrides project Milestones tab CLP. */
  clpScheduleOverride: {
    rows: [{
      milestone: String,
      percentDue: Number,
      constructionLinked: { type: Boolean, default: true },
      targetDate: Date,
      achievedDate: Date,
      scheduleOrder: { type: Number, default: 0 },
    }],
    updatedBy: String,
    updatedAt: Date,
  },
  /** Per-milestone date overrides when using project CLP (milestoneKey → date). */
  clpMilestoneDates: { type: Map, of: Date },
}, { timestamps: true });

UnitSchema.index({ crmUnitKey: 1 });
UnitSchema.index({ project: 1, crmBookingId: 1 }, { sparse: true });
UnitSchema.index({ project: 1, unitNumber: 1 });
UnitSchema.index({ lastImportBatchId: 1 });

export default mongoose.models.Unit || mongoose.model('Unit', UnitSchema);
