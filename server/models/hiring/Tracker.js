import mongoose from 'mongoose';

const { Schema } = mongoose;

export const TRK_STAGES = ['SHORTLISTED', 'HR_SCREENING', 'MGMT_R1', 'MGMT_R2', 'DECISION'];
export const TRK_STATUSES = ['ACTIVE', 'ON_HOLD', 'REJECTED', 'WITHDRAWN', 'SELECTED'];
export const TRK_REASON_CODES = [
  'NOT_SUITABLE', 'CTC_MISMATCH', 'NOTICE_PERIOD', 'COMMUNICATION', 'EXPERIENCE_GAP',
  'CANDIDATE_WITHDREW', 'OFFER_DECLINED', 'NO_SHOW', 'POSITION_ON_HOLD', 'BETTER_CANDIDATE', 'OTHER'
];
export const TRK_TEMPLATE_KINDS = ['HR', 'MGMT_R1', 'MGMT_R2'];
export const TRK_RECOMMENDATIONS = ['RECOMMENDED', 'NOT_RECOMMENDED', 'HOLD'];
export const TRK_ROUND_STATUSES = ['NOT_SCHEDULED', 'SCHEDULED', 'NO_SHOW', 'COMPLETED'];
export const TRK_DECISIONS = ['SELECTED', 'REJECTED', 'ON_HOLD'];

const QuestionSchema = new Schema({
  id: { type: String, required: true },
  category: { type: String, default: '' },
  text: { type: String, required: true },
  guidance: { type: String, default: '' },
  weight: { type: Number, min: 0, max: 10, default: 3 }
}, { _id: false });

const PositionSchema = new Schema({
  code: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  department: String,
  reportsTo: String,
  experience: String,
  education: String,
  location: String,
  mandate: String,
  kpis: [String],
  knockouts: [String],
  openings: { type: Number, default: 1, min: 0 },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 }
}, { timestamps: true });

const TemplateSchema = new Schema({
  positionId: { type: Schema.Types.ObjectId, required: true },
  kind: { type: String, enum: TRK_TEMPLATE_KINDS, required: true },
  questions: [QuestionSchema],
  version: { type: Number, default: 1 },
  updatedById: String,
  updatedByName: String
}, { timestamps: true });
TemplateSchema.index({ positionId: 1, kind: 1 }, { unique: true });

const RoundSchema = new Schema({
  status: { type: String, enum: TRK_ROUND_STATUSES, default: 'NOT_SCHEDULED' },
  scheduledAt: { type: Date, default: null },
  mode: { type: String, enum: ['IN_PERSON', 'VIDEO', 'PHONE', ''], default: '' },
  venue: { type: String, default: '' },
  interviewerId: { type: String, default: '' },
  interviewerName: { type: String, default: '' },
  rescheduleCount: { type: Number, default: 0 },
  noShowCount: { type: Number, default: 0 },
  completedAt: { type: Date, default: null }
}, { _id: false });

const HistorySchema = new Schema({
  at: { type: Date, default: Date.now },
  byId: String,
  byName: String,
  type: { type: String, enum: ['CREATED', 'STAGE', 'STATUS', 'SCHEDULE', 'EVAL', 'DECISION', 'ASSIGN', 'NOTE'], required: true },
  fromStage: String,
  toStage: String,
  fromStatus: String,
  toStatus: String,
  reasonCode: { type: String, default: '' },
  summary: { type: String, default: '' },
  note: { type: String, default: '' },
  /** Note text is hidden from users without management access. */
  confidential: { type: Boolean, default: false },
  override: { type: Boolean, default: false }
}, { _id: true });

const CandidateSchema = new Schema({
  positionId: { type: Schema.Types.ObjectId, required: true, index: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, default: '', trim: true },
  phone: { type: String, default: '', trim: true },
  currentCompany: { type: String, default: '' },
  currentDesignation: { type: String, default: '' },
  totalExperienceYears: { type: Number, default: null },
  location: { type: String, default: '' },
  currentCtcLakh: { type: Number, default: null },
  expectedCtcLakh: { type: Number, default: null },
  noticePeriodDays: { type: Number, default: null },
  source: { type: String, default: '' },
  linkedinUrl: { type: String, default: '' },
  profileNotes: { type: String, default: '' },
  resume: {
    fileId: { type: Schema.Types.ObjectId, default: null },
    name: String,
    mime: String,
    size: Number,
    uploadedAt: Date
  },

  stage: { type: String, enum: TRK_STAGES, default: 'SHORTLISTED', index: true },
  status: { type: String, enum: TRK_STATUSES, default: 'ACTIVE', index: true },
  stageEnteredAt: { type: Date, default: Date.now },
  /** Reason code is visible to everyone; the free-text note may be confidential. */
  statusReasonCode: { type: String, default: '' },
  statusReason: { type: String, default: '' },
  statusReasonConfidential: { type: Boolean, default: false },
  overrideCount: { type: Number, default: 0 },

  hrOwnerId: { type: String, default: '' },
  hrOwnerName: { type: String, default: '' },
  hr: {
    status: { type: String, enum: ['NOT_STARTED', 'DRAFT', 'SUBMITTED'], default: 'NOT_STARTED' },
    score: { type: Number, default: null },
    recommendation: { type: String, enum: [...TRK_RECOMMENDATIONS, ''], default: '' },
    scheduledAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    evaluatorName: { type: String, default: '' }
  },

  /** Operational status only — never scores, recommendations or remarks. */
  r1: { type: RoundSchema, default: () => ({}) },
  r1EvalStatus: { type: String, enum: ['NOT_STARTED', 'DRAFT', 'SUBMITTED'], default: 'NOT_STARTED' },
  r2Required: { type: Boolean, default: false },
  r2: { type: RoundSchema, default: () => ({}) },
  r2EvalStatus: { type: String, enum: ['NOT_STARTED', 'DRAFT', 'SUBMITTED'], default: 'NOT_STARTED' },

  decision: {
    outcome: { type: String, enum: [...TRK_DECISIONS, ''], default: '' },
    remarks: { type: String, default: '' },
    byId: String,
    byName: String,
    at: Date
  },

  nextAction: { type: String, default: '' },
  nextActionDue: { type: Date, default: null },
  nextActionOwner: { type: String, default: '' },

  history: [HistorySchema],
  createdById: String,
  createdByName: String,
  isDeleted: { type: Boolean, default: false }
}, { timestamps: true, optimisticConcurrency: true });
CandidateSchema.index({ positionId: 1, stage: 1, status: 1, isDeleted: 1 });

const AnswerSchema = new Schema({
  qid: { type: String, required: true },
  category: String,
  text: String,
  guidance: String,
  weight: { type: Number, default: 3 },
  response: { type: String, default: '' },
  comment: { type: String, default: '' },
  score: { type: Number, min: 1, max: 5, default: null }
}, { _id: false });

const EvalBase = {
  candidateId: { type: Schema.Types.ObjectId, required: true },
  positionId: { type: Schema.Types.ObjectId, required: true },
  templateVersion: Number,
  answers: [AnswerSchema],
  score: { type: Number, default: null },
  recommendation: { type: String, enum: [...TRK_RECOMMENDATIONS, ''], default: '' },
  summary: { type: String, default: '' },
  status: { type: String, enum: ['DRAFT', 'SUBMITTED'], default: 'DRAFT' },
  evaluatorId: String,
  evaluatorName: String,
  submittedAt: { type: Date, default: null }
};

const HrEvalSchema = new Schema({ ...EvalBase }, { timestamps: true });
HrEvalSchema.index({ candidateId: 1 }, { unique: true });

const MgmtEvalSchema = new Schema({
  ...EvalBase,
  round: { type: Number, enum: [1, 2], required: true },
  strengths: { type: String, default: '' },
  concerns: { type: String, default: '' },
  requiresSecondRound: { type: Boolean, default: false }
}, { timestamps: true });
MgmtEvalSchema.index({ candidateId: 1, round: 1 }, { unique: true });

const FileSchema = new Schema({
  candidateId: { type: Schema.Types.ObjectId, required: true, index: true },
  name: String,
  mime: String,
  size: Number,
  data: Buffer,
  uploadedById: String
}, { timestamps: true });

const model = (name, schema, coll) => mongoose.models[name] || mongoose.model(name, schema, coll);

export const TrkPosition = model('TrkPosition', PositionSchema, 'hiring_trk_positions');
export const TrkTemplate = model('TrkTemplate', TemplateSchema, 'hiring_trk_templates');
export const TrkCandidate = model('TrkCandidate', CandidateSchema, 'hiring_trk_candidates');
export const TrkHrEval = model('TrkHrEval', HrEvalSchema, 'hiring_trk_hr_evals');
/** Confidential — read/write only through management-guarded routes. */
export const TrkMgmtEval = model('TrkMgmtEval', MgmtEvalSchema, 'hiring_trk_mgmt_evals');
export const TrkFile = model('TrkFile', FileSchema, 'hiring_trk_files');
