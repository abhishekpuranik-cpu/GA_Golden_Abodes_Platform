import mongoose from 'mongoose';
import { softDeleteFields, auditUserFields } from '../../../lib/adminServices/mongoose.js';

/**
 * Per-employee travel approval chain (scalable L1 → L2 → …).
 * Never hardcode people in app logic — resolve users by email at seed / Setup time.
 */
const LevelSchema = new mongoose.Schema({
  level: { type: Number, required: true, min: 1, max: 5 },
  approverUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  label: { type: String, default: '' } // e.g. L1 Manager, L2 Director
}, { _id: false });

const ChainSchema = new mongoose.Schema({
  employeeUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  levels: {
    type: [LevelSchema],
    validate: {
      validator(v) {
        if (!Array.isArray(v) || v.length < 1 || v.length > 5) return false;
        const nums = v.map((x) => x.level).sort((a, b) => a - b);
        return nums.every((n, i) => n === i + 1);
      },
      message: 'levels must be contiguous 1..N (max 5)'
    }
  },
  /** Optional entity scope; empty string = all entities */
  entityTag: { type: String, default: '' },
  notes: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  ...softDeleteFields(),
  ...auditUserFields()
}, { timestamps: true });

ChainSchema.index(
  { employeeUserId: 1, entityTag: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false, isActive: true } }
);
ChainSchema.index({ 'levels.approverUserId': 1, isActive: 1 });

export default mongoose.models.TravelApprovalChain
  || mongoose.model('TravelApprovalChain', ChainSchema, 'travelApprovalChains');
