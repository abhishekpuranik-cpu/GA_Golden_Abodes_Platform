import mongoose from 'mongoose';

const MilestoneSchema = new mongoose.Schema({
  project: { type: String, required: true },
  tower: String, milestoneName: String, clpStage: String, clpPercent: Number,
  completedDate: Date, loggedBy: String, loggedAt: Date,
  demandTriggerStatus: { type: String, enum: ['pending','triggered','completed'], default: 'pending' },
  demandsCreated: { type: Number, default: 0 },
  architectCertIssued: Boolean, architectCertDate: Date,
}, { timestamps: true });
MilestoneSchema.index({ project: 1, demandTriggerStatus: 1 });

export default mongoose.models.ConstructionMilestone || mongoose.model('ConstructionMilestone', MilestoneSchema);
