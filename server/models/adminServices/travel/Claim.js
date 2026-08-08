import mongoose from 'mongoose';
import { ENTITY_TAGS, CLAIM_STATUSES } from '../../../lib/adminServices/constants.js';
import { softDeleteFields, auditUserFields } from '../../../lib/adminServices/mongoose.js';

const StateHistorySchema = new mongoose.Schema({
  from: String,
  to: { type: String, required: true },
  action: { type: String, required: true },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
  comment: String,
  at: { type: Date, default: Date.now }
}, { _id: false });

const LevelApprovalSchema = new mongoose.Schema({
  level: { type: Number, required: true },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
  comment: String,
  at: { type: Date, default: Date.now }
}, { _id: false });

const ChainSnapSchema = new mongoose.Schema({
  level: { type: Number, required: true },
  approverUserId: { type: String, required: true },
  label: { type: String, default: '' }
}, { _id: false });

const ClaimSchema = new mongoose.Schema({
  entityTag: { type: String, enum: ENTITY_TAGS, required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  claimPeriod: { type: String, required: true },
  tripIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TravelTrip' }],
  tripCount: { type: Number, default: 0 },
  totalDistanceMetres: { type: Number, default: 0 },
  verifiedDistanceMetres: { type: Number, default: 0 },
  verifiedPercent: { type: Number, default: 0 },
  fuelTotalPaise: { type: Number, default: 0 },
  ancillaryTotalPaise: { type: Number, default: 0 },
  grandTotalPaise: { type: Number, default: 0 },
  exceptionCount: { type: Number, default: 0 },
  status: { type: String, enum: CLAIM_STATUSES, default: 'OPEN' },
  /** Snapshot of L1…Ln at submit — immutable for this claim */
  approvalChainSnapshot: { type: [ChainSnapSchema], default: [] },
  pendingApprovalLevel: { type: Number, default: null },
  levelApprovals: { type: [LevelApprovalSchema], default: [] },
  paymentReference: { type: String, default: '' },
  paidAt: { type: Date, default: null },
  stateHistory: { type: [StateHistorySchema], default: [] },
  ...softDeleteFields(),
  ...auditUserFields()
}, { timestamps: true });

// MongoDB partial indexes disallow $ne/$not — equality only (isDeleted defaults to false).
ClaimSchema.index(
  { employeeId: 1, claimPeriod: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

ClaimSchema.pre('save', function preSave(next) {
  if (!this.isNew && (this.status === 'APPROVED' || this.status === 'PAID')) {
    const locked = new Set([
      'entityTag', 'employeeId', 'claimPeriod', 'tripIds', 'tripCount',
      'totalDistanceMetres', 'verifiedDistanceMetres', 'verifiedPercent',
      'fuelTotalPaise', 'ancillaryTotalPaise', 'grandTotalPaise'
    ]);
    const modified = this.modifiedPaths().filter((p) => locked.has(p));
    if (modified.length && this.status === 'PAID') {
      return next(new Error('PAID claim is immutable'));
    }
    if (
      modified.length
      && this.status === 'APPROVED'
      && !this.isModified('status')
      && !this.isModified('paymentReference')
      && !this.isModified('paidAt')
      && !this.isModified('stateHistory')
    ) {
      return next(new Error('APPROVED claim money/trip fields are immutable'));
    }
  }
  return next();
});

export default mongoose.models.TravelClaim
  || mongoose.model('TravelClaim', ClaimSchema, 'travelClaims');
