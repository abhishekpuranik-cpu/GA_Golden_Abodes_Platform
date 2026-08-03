import mongoose from 'mongoose';
import { ENTITY_TAGS, POLICY_DEFAULTS } from '../../../lib/adminServices/constants.js';
import { softDeleteFields, auditUserFields } from '../../../lib/adminServices/mongoose.js';

const VerifierSchema = new mongoose.Schema({
  departmentId: { type: String, required: true },
  verifierUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true }
}, { _id: false });

const PolicySchema = new mongoose.Schema({
  entityTag: { type: String, enum: ENTITY_TAGS, required: true, unique: true },
  roadFactor: { type: Number, default: POLICY_DEFAULTS.roadFactor },
  dailyCapKm: { type: Number, default: POLICY_DEFAULTS.dailyCapKm },
  monthlyCapKm: { type: Number, default: POLICY_DEFAULTS.monthlyCapKm },
  backdatingWindowDays: { type: Number, default: POLICY_DEFAULTS.backdatingWindowDays },
  homeToOfficeClaimable: { type: Boolean, default: POLICY_DEFAULTS.homeToOfficeClaimable },
  requireReceiptAboveAncillaryPaise: { type: Number, default: POLICY_DEFAULTS.requireReceiptAboveAncillaryPaise },
  finalApproverUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', default: null },
  alternateApproverUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', default: null },
  verifierAssignments: { type: [VerifierSchema], default: [] },
  ...softDeleteFields(),
  ...auditUserFields()
}, { timestamps: true });

export default mongoose.models.TravelPolicyConfig
  || mongoose.model('TravelPolicyConfig', PolicySchema, 'travelPolicyConfig');
