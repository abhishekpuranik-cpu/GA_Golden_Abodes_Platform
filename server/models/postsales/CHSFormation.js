import mongoose from 'mongoose';

const CHSDocSchema = new mongoose.Schema({ srNo: Number, document: String, status: { type: String, enum: ['pending','collected','submitted'], default: 'pending' }, collectedDate: Date, driveLink: String });
const CHSFormationSchema = new mongoose.Schema({
  project: { type: String, required: true, unique: true },
  entity: String, consultant: String, consultantContact: String,
  documentChecklist: [CHSDocSchema],
  registrationStatus: { type: String, enum: ['not_started','applied','under_review','registered'], default: 'not_started' },
  registrationDate: Date, registrationNumber: String, registrarName: String,
  bankAccount: { status: String, bank: String, accountNumber: String, openedDate: Date },
  maintenanceTransfer: { status: String, amountCollected: Number, amountTransferred: Number, transferDate: Date, reconciliationLink: String },
}, { timestamps: true });

export default mongoose.models.CHSFormation || mongoose.model('CHSFormation', CHSFormationSchema);
