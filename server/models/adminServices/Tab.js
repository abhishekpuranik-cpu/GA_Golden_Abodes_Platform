import mongoose from 'mongoose';
import { TAB_KEYS } from '../../lib/adminServices/constants.js';

const TabSchema = new mongoose.Schema({
  key: { type: String, enum: TAB_KEYS, required: true, unique: true },
  displayName: { type: String, required: true },
  route: { type: String, required: true },
  isEnabled: { type: Boolean, default: false },
  sortOrder: { type: Number, required: true },
  requiredPermission: { type: String, required: true },
  iconKey: { type: String, default: '' }
}, { timestamps: true });

export default mongoose.models.AdminServicesTab
  || mongoose.model('AdminServicesTab', TabSchema, 'adminServicesTabs');
