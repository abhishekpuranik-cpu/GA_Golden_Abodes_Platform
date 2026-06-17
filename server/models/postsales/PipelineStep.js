import mongoose from 'mongoose';

const ChecklistItemSchema = new mongoose.Schema({ item: String, done: { type: Boolean, default: false }, doneAt: Date, doneBy: String });
const ActivityLogSchema = new mongoose.Schema({
  action: { type: String, enum: ['assigned', 'started', 'checklist', 'document_uploaded', 'completed', 'escalated', 'note'], required: true },
  at: { type: Date, default: Date.now },
  by: String,
  detail: String,
}, { _id: false });
const PipelineStepSchema = new mongoose.Schema({
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  stepNumber: { type: Number, required: true, min: 1, max: 20 },
  stepName: String, phase: String,
  status: { type: String, enum: ['pending','in_progress','completed','overdue','blocked','na'], default: 'pending' },
  assignedRole: String, assignedTo: String,
  triggerDate: Date, dueDate: Date, completedDate: Date, completedBy: String,
  slaBreach: { type: Boolean, default: false }, slaBreachDays: Number,
  notes: String, escalatedTo: String, escalationDate: Date, escalationReason: String,
  checklist: [ChecklistItemSchema],
  activityLog: [ActivityLogSchema],
}, { timestamps: true });
PipelineStepSchema.index({ unitId: 1, stepNumber: 1 }, { unique: true });
PipelineStepSchema.index({ status: 1, dueDate: 1 });
PipelineStepSchema.index({ assignedTo: 1, dueDate: 1, status: 1 });
PipelineStepSchema.index({ slaBreach: 1 });

export default mongoose.models.PipelineStep || mongoose.model('PipelineStep', PipelineStepSchema);
