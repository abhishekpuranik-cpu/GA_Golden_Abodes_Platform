import mongoose from 'mongoose';

const DemandSchema = new mongoose.Schema({
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  entity: { type: String, required: true },
  milestoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'ConstructionMilestone' },
  milestoneName: String, clpPercent: Number,
  milestoneOrder: { type: Number, default: 0 },
  targetDate: Date,
  actualDate: Date,
  demandAmount: Number, gstAmount: Number, totalAmount: Number,
  issuedDate: Date, dueDate: Date,
  sentMode: { type: String, enum: ['email','whatsapp','courier'] },
  paymentStatus: { type: String, enum: ['pending','partial','paid','overdue'], default: 'pending' },
  paidAmount: { type: Number, default: 0 }, paidDate: Date, receiptNumber: String,
  pendingAmount: Number,
  clpLetterTaskAt: Date,
  source: { type: String, enum: ['seed', 'v1_import', 'upload', 'manual', 'payment'], default: 'manual' },
  driveLink: String, architectCertLink: String,
}, { timestamps: true });
DemandSchema.index({ unitId: 1 });
DemandSchema.index({ paymentStatus: 1 });
DemandSchema.index({ entity: 1, issuedDate: -1 });

export default mongoose.models.Demand || mongoose.model('Demand', DemandSchema);
