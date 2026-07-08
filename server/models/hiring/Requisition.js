import mongoose from 'mongoose';
import { ENTITY_TAGS } from '../../lib/hiring/constants.js';

const baseFields = {
  entityTag: { type: String, enum: ENTITY_TAGS, required: true },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true }
};

const RequisitionSchema = new mongoose.Schema({
  ...baseFields,
  reqCode: { type: String, unique: true, immutable: true },
  role: { type: String, required: true },
  department: String,
  projectName: String,
  location: { type: String, required: true },
  bandMinPaise: Number,
  bandMaxPaise: Number,
  experienceMinYears: Number,
  experienceMaxYears: Number,
  brief: { type: String, required: true },
  headcount: { type: Number, default: 1 },
  status: {
    type: String,
    enum: ['Draft', 'Sourcing', 'Shortlisting', 'Interviewing', 'Offer', 'Closed', 'Cancelled'],
    default: 'Draft'
  },
  metaviewSearchId: { type: String, default: null },
  sourcingMode: { type: String, enum: ['auto', 'manual'], default: 'manual' },
  closedReason: String
}, { timestamps: true });

RequisitionSchema.index({ status: 1, entityTag: 1, isDeleted: 1 });

export default mongoose.models.HiringRequisition
  || mongoose.model('HiringRequisition', RequisitionSchema, 'hiring_requisitions');
