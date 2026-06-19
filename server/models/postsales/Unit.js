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
  overallStatus: { type: String, enum: ['active','possession_given','cancelled','on_hold'], default: 'active' },
  agreementDate: Date, registrationDate: Date, possessionDate: Date,
  crmExecutive: String,
  cxExecutive: String,
  backendExecutive: String,
  crmUnitKey: String,
  v1UnitKey: String,
  firstImportedAt: Date,
  lastImportBatchId: String,
}, { timestamps: true });

UnitSchema.index({ crmUnitKey: 1 });
UnitSchema.index({ project: 1, unitNumber: 1 });
UnitSchema.index({ lastImportBatchId: 1 });

export default mongoose.models.Unit || mongoose.model('Unit', UnitSchema);
