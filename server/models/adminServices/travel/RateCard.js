import mongoose from 'mongoose';
import { ENTITY_TAGS, VEHICLE_TYPES } from '../../../lib/adminServices/constants.js';
import { softDeleteFields, auditUserFields } from '../../../lib/adminServices/mongoose.js';

const RateCardSchema = new mongoose.Schema({
  entityTag: { type: String, enum: ENTITY_TAGS, required: true },
  vehicleType: { type: String, enum: VEHICLE_TYPES, required: true },
  ratePerKmPaise: { type: Number, required: true },
  effectiveFrom: { type: Date, required: true },
  effectiveTo: { type: Date, default: null },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', default: null },
  notes: { type: String, default: '' },
  ...softDeleteFields(),
  ...auditUserFields()
}, { timestamps: true });

RateCardSchema.index({ entityTag: 1, vehicleType: 1, effectiveFrom: 1 });

export default mongoose.models.TravelRateCard
  || mongoose.model('TravelRateCard', RateCardSchema, 'travelRateCards');
