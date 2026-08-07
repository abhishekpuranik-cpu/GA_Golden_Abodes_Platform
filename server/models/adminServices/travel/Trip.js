import mongoose from 'mongoose';
import {
  ENTITY_TAGS, VEHICLE_TYPES, TRIP_PURPOSES, TRIP_STATUSES,
  ANCILLARY_TYPES, EXCEPTION_FLAGS, DISTANCE_BASIS
} from '../../../lib/adminServices/constants.js';
import { softDeleteFields, auditUserFields } from '../../../lib/adminServices/mongoose.js';

const AncillarySchema = new mongoose.Schema({
  type: { type: String, enum: ANCILLARY_TYPES, required: true },
  amountPaise: { type: Number, required: true },
  receiptDriveFileId: { type: String, default: null },
  note: { type: String, default: '' }
}, { _id: false });

const StateHistorySchema = new mongoose.Schema({
  from: String,
  to: { type: String, required: true },
  action: { type: String, required: true },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
  comment: String,
  at: { type: Date, default: Date.now }
}, { _id: false });

const TripSchema = new mongoose.Schema({
  entityTag: { type: String, enum: ENTITY_TAGS, required: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  travelDate: { type: Date, required: true },
  purpose: { type: String, enum: TRIP_PURPOSES, required: true },
  purposeNote: { type: String, default: '' },
  vehicleType: { type: String, enum: VEHICLE_TYPES, required: true },
  route: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'TravelLocation' }],
    validate: {
      validator(v) { return Array.isArray(v) && v.length >= 2; },
      message: 'route requires at least 2 stops'
    }
  },
  isRoundTrip: { type: Boolean, default: false },
  computedDistanceMetres: { type: Number, required: true },
  claimedDistanceMetres: { type: Number, required: true },
  isOverride: { type: Boolean, default: false },
  overrideReason: { type: String, default: '' },
  distanceBasis: { type: String, enum: DISTANCE_BASIS, required: true },
  ratePerKmPaise: { type: Number, default: null },
  fuelAmountPaise: { type: Number, default: 0 },
  ancillary: { type: [AncillarySchema], default: [] },
  ancillaryTotalPaise: { type: Number, default: 0 },
  totalClaimPaise: { type: Number, default: 0 },
  claimId: { type: mongoose.Schema.Types.ObjectId, ref: 'TravelClaim', default: null },
  status: { type: String, enum: TRIP_STATUSES, default: 'DRAFT' },
  exceptionFlags: [{ type: String, enum: EXCEPTION_FLAGS }],
  exceptionResolutions: [{
    flag: String,
    resolution: { type: String, enum: ['accepted', 'rejected'] },
    by: mongoose.Schema.Types.ObjectId,
    comment: String,
    at: { type: Date, default: Date.now }
  }],
  departmentId: { type: String, default: '' },
  remarks: { type: String, default: '' },
  stateHistory: { type: [StateHistorySchema], default: [] },
  ...softDeleteFields(),
  ...auditUserFields()
}, { timestamps: true });

TripSchema.index({ employeeId: 1, travelDate: 1, isDeleted: 1 });
TripSchema.index({ status: 1, entityTag: 1 });
TripSchema.index({ claimId: 1 });
TripSchema.index({ exceptionFlags: 1, status: 1 });

/** BR-12: approved/paid claims lock trips — also enforce immutability for REJECTED edits via routes. */
TripSchema.pre('save', async function preSave() {
  // Mongoose 7+: async hooks must not use next() — it is not passed and throws "next is not a function".
  if (this.isNew) return;
  if (this.claimId) {
    const Claim = mongoose.model('TravelClaim');
    const claim = await Claim.findById(this.claimId).lean();
    if (claim && (claim.status === 'APPROVED' || claim.status === 'PAID')) {
      const allowed = ['updatedAt', 'updatedBy'];
      const modified = this.modifiedPaths().filter((p) => !allowed.includes(p));
      if (modified.length) {
        throw new Error('BR-12: trip on APPROVED/PAID claim is immutable');
      }
    }
  }
});

export default mongoose.models.TravelTrip
  || mongoose.model('TravelTrip', TripSchema, 'travelTrips');
