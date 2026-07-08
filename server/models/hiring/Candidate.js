import mongoose from 'mongoose';
import { ENTITY_TAGS, CANDIDATE_SOURCES } from '../../lib/hiring/constants.js';

const FeedbackSchema = new mongoose.Schema({
  verdict: { type: String, enum: ['YES', 'NO', 'MAYBE'] },
  note: String,
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
  at: { type: Date, default: Date.now },
  syncedToMetaview: { type: Boolean, default: false }
}, { _id: true });

const CandidateSchema = new mongoose.Schema({
  entityTag: { type: String, enum: ENTITY_TAGS, required: true },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  requisitionId: { type: mongoose.Schema.Types.ObjectId, ref: 'HiringRequisition', required: true },
  source: { type: String, enum: CANDIDATE_SOURCES, required: true },
  metaviewCandidateId: { type: String, default: null },
  name: { type: String, required: true },
  phone: String,
  email: String,
  linkedinUrl: String,
  currentCompany: String,
  currentCtcPaise: Number,
  expectedCtcPaise: Number,
  noticePeriodDays: Number,
  cityCurrent: String,
  highlights: String,
  resumeDriveFileId: String,
  profileSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  profileFetchedAt: { type: Date, default: null },
  currentStageNumber: { type: Number, default: 1 },
  feedbackHistory: [FeedbackSchema],
  stageEnteredAt: { type: Date, default: Date.now },
  stageHistory: [{
    stage: Number,
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'users', default: null }
  }]
}, { timestamps: true });

CandidateSchema.index({ requisitionId: 1, currentStageNumber: 1, isDeleted: 1 });
CandidateSchema.index({ metaviewCandidateId: 1, requisitionId: 1 }, { sparse: true });

export default mongoose.models.HiringCandidate
  || mongoose.model('HiringCandidate', CandidateSchema, 'hiring_candidates');
