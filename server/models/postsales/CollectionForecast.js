import mongoose from 'mongoose';

const InstallmentSchema = new mongoose.Schema({
  amount: { type: Number, required: true, min: 0 },
  expectedDate: { type: Date, required: true },
  includesTax: { type: Boolean, default: false },
  taxAmount: { type: Number, default: 0 },
  riskCategory: { type: String, enum: ['clear', 'risky', 'delayed'], default: 'clear' },
  note: String,
  receivedAmount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['planned', 'complete', 'delayed'], default: 'planned' },
  revisedDate: Date,
}, { _id: true });

const MilestoneForecastSchema = new mongoose.Schema({
  demandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Demand' },
  milestoneName: { type: String, required: true },
  installments: { type: [InstallmentSchema], default: [] },
}, { _id: true });

const CollectionForecastSchema = new mongoose.Schema({
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true, unique: true },
  collectionRemarks: { type: String, default: '' },
  cxPriority: { type: String, enum: ['normal', 'high', 'watch'], default: 'normal' },
  followUpOwner: String,
  gstDueOverride: Number,
  gstReceivedOverride: Number,
  gstPendingOverride: Number,
  bookingDisbursedAmount: { type: Number, default: 0 },
  bookingSettlementAppliedAt: Date,
  milestones: { type: [MilestoneForecastSchema], default: [] },
}, { timestamps: true });

CollectionForecastSchema.index({ unitId: 1 });

export default mongoose.models.CollectionForecast
  || mongoose.model('CollectionForecast', CollectionForecastSchema);
