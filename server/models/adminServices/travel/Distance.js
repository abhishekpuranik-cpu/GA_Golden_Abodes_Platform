import mongoose from 'mongoose';
import { DISTANCE_SOURCES } from '../../../lib/adminServices/constants.js';
import { softDeleteFields, auditUserFields } from '../../../lib/adminServices/mongoose.js';

const RevisionSchema = new mongoose.Schema({
  distanceMetres: { type: Number, required: true },
  source: { type: String, enum: DISTANCE_SOURCES, required: true },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
  changedAt: { type: Date, default: Date.now },
  reason: { type: String, default: '' }
}, { _id: false });

const DistanceSchema = new mongoose.Schema({
  pairKey: { type: String, required: true, unique: true },
  locationAId: { type: mongoose.Schema.Types.ObjectId, ref: 'TravelLocation', required: true },
  locationBId: { type: mongoose.Schema.Types.ObjectId, ref: 'TravelLocation', required: true },
  distanceMetres: { type: Number, required: true },
  isVerified: { type: Boolean, default: false },
  source: { type: String, enum: DISTANCE_SOURCES, default: 'ESTIMATE' },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', default: null },
  verifiedAt: { type: Date, default: null },
  straightLineMetres: { type: Number, required: true },
  revisionHistory: { type: [RevisionSchema], default: [] },
  claimCount: { type: Number, default: 0 },
  ...softDeleteFields(),
  ...auditUserFields()
}, { timestamps: true });

DistanceSchema.index({ isVerified: 1, isDeleted: 1 });
DistanceSchema.index({ locationAId: 1, locationBId: 1 });

export default mongoose.models.TravelDistance
  || mongoose.model('TravelDistance', DistanceSchema, 'travelDistances');
