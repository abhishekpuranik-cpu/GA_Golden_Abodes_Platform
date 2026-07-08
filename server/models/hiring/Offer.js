import mongoose from 'mongoose';
import { ENTITY_TAGS } from '../../lib/hiring/constants.js';

const OfferSchema = new mongoose.Schema({
  entityTag: { type: String, enum: ENTITY_TAGS, required: true },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'users', required: true },
  candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'HiringCandidate', required: true, unique: true },
  requisitionId: { type: mongoose.Schema.Types.ObjectId, ref: 'HiringRequisition', required: true },
  fixedCtcPaise: { type: Number, required: true },
  variablePaise: { type: Number, default: 0 },
  designationOffered: String,
  joiningDate: Date,
  status: { type: String, enum: ['Draft', 'Sent', 'Accepted', 'Declined', 'Withdrawn'], default: 'Draft' },
  offerLetterDriveFileId: String
}, { timestamps: true });

OfferSchema.index({ requisitionId: 1, isDeleted: 1 });

export default mongoose.models.HiringOffer
  || mongoose.model('HiringOffer', OfferSchema, 'hiring_offers');
