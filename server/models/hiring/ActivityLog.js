import mongoose from 'mongoose';

const ActivityLogSchema = new mongoose.Schema({
  refType: { type: String, required: true },
  refId: { type: mongoose.Schema.Types.ObjectId, required: true },
  action: { type: String, required: true },
  detail: String,
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'users', default: null },
  at: { type: Date, default: Date.now }
}, { timestamps: false });

ActivityLogSchema.index({ refType: 1, refId: 1, at: -1 });

export default mongoose.models.HiringActivityLog
  || mongoose.model('HiringActivityLog', ActivityLogSchema, 'hiring_activity_log');
