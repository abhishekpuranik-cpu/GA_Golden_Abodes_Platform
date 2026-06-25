import mongoose from 'mongoose';

const DisbursementTaskSchema = new mongoose.Schema({
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  demandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Demand' },
  forecastId: { type: mongoose.Schema.Types.ObjectId, ref: 'CollectionForecast' },
  installmentId: { type: mongoose.Schema.Types.ObjectId },
  milestoneName: String,
  expectedAmount: { type: Number, default: 0 },
  expectedDate: Date,
  assignee: String,
  status: { type: String, enum: ['open', 'complete', 'delayed'], default: 'open' },
  revisedDate: Date,
  completedAmount: { type: Number, default: 0 },
  completedAt: Date,
  note: String,
}, { timestamps: true });

DisbursementTaskSchema.index({ unitId: 1, status: 1 });
DisbursementTaskSchema.index({ assignee: 1, status: 1 });

export default mongoose.models.DisbursementTask
  || mongoose.model('DisbursementTask', DisbursementTaskSchema);
