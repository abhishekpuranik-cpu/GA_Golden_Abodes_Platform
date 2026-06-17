import mongoose from 'mongoose';

const DisbursementSchema = new mongoose.Schema({ tranche: Number, amount: Number, date: Date, linkedDemandId: mongoose.Schema.Types.ObjectId });
const OwnContribSchema = new mongoose.Schema({ milestone: String, amount: Number, dueDate: Date, paidDate: Date, status: { type: String, enum: ['pending','paid','overdue'], default: 'pending' } });
const LoanTrackerSchema = new mongoose.Schema({
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true, unique: true },
  fundingType: { type: String, enum: ['home_loan','self_funded'] },
  bank: String, rmName: String, rmPhone: String, loanAmount: Number,
  applicationDate: Date,
  applicationStage: { type: String, enum: ['applied','processing','valuation','sanctioned','rejected'] },
  sanctionDate: Date, sanctionAmount: Number, sanctionLetterLink: String,
  disbursements: [DisbursementSchema],
  ownContributionSchedule: [OwnContribSchema],
}, { timestamps: true });

export default mongoose.models.LoanTracker || mongoose.model('LoanTracker', LoanTrackerSchema);
