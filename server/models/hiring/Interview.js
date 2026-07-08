import mongoose from 'mongoose';
import { ENTITY_TAGS } from '../../lib/hiring/constants.js';

const ScorecardItemSchema = new mongoose.Schema({
  criterion: String,
  rating: { type: Number, min: 1, max: 5 },
  note: String
}, { _id: false });

const InterviewSchema = new mongoose.Schema({
  entityTag: { type: String, enum: ENTITY_TAGS, required: true },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'HiringCandidate', required: true },
  requisitionId: { type: mongoose.Schema.Types.ObjectId, ref: 'HiringRequisition', required: true },
  round: { type: Number, required: true },
  panel: [String],
  scheduledAt: Date,
  mode: { type: String, enum: ['in-person', 'phone', 'video'], default: 'in-person' },
  scorecard: [ScorecardItemSchema],
  outcome: { type: String, enum: ['Pending', 'Advance', 'Reject', 'Hold'], default: 'Pending' }
}, { timestamps: true });

InterviewSchema.index({ candidateId: 1, isDeleted: 1 });
InterviewSchema.index({ scheduledAt: 1, isDeleted: 1 });

export default mongoose.models.HiringInterview
  || mongoose.model('HiringInterview', InterviewSchema, 'hiring_interviews');
