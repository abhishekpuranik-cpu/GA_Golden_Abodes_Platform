import mongoose from 'mongoose';
import { ENTITY_TAGS, LOCATION_CATEGORIES } from '../../../lib/adminServices/constants.js';
import { softDeleteFields, auditUserFields } from '../../../lib/adminServices/mongoose.js';

const LocationSchema = new mongoose.Schema({
  entityTag: { type: String, enum: ENTITY_TAGS, required: true },
  name: { type: String, required: true },
  category: { type: String, enum: LOCATION_CATEGORIES, required: true },
  lat: { type: Number, required: true, min: -90, max: 90 },
  lng: { type: Number, required: true, min: -180, max: 180 },
  address: { type: String, default: '' },
  linkedProjectId: { type: mongoose.Schema.Types.ObjectId, default: null },
  isActive: { type: Boolean, default: true },
  ...softDeleteFields(),
  ...auditUserFields()
}, { timestamps: true });

LocationSchema.index(
  { entityTag: 1, name: 1 },
  {
    unique: true,
    collation: { locale: 'en', strength: 2 },
    partialFilterExpression: { isDeleted: { $ne: true } }
  }
);

export default mongoose.models.TravelLocation
  || mongoose.model('TravelLocation', LocationSchema, 'travelLocations');
