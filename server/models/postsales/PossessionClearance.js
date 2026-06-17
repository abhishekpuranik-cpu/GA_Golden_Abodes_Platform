import mongoose from 'mongoose';

const ClearanceStageSchema = new mongoose.Schema({
  status: { type: String, enum: ['pending','cleared','blocked'], default: 'pending' },
  clearedBy: String,
  clearedAt: Date,
  notes: String,
});

const AccountsClearanceSchema = new mongoose.Schema({
  status: { type: String, enum: ['pending','cleared','blocked'], default: 'pending' },
  clearedBy: String,
  clearedAt: Date,
  notes: String,
  outstandingAmount: Number,
});

const ProjectsClearanceSchema = new mongoose.Schema({
  status: { type: String, enum: ['pending','cleared','blocked'], default: 'pending' },
  clearedBy: String,
  clearedAt: Date,
  notes: String,
  snagsRaised: Number,
  snagsCleared: Number,
});

const FacilityClearanceSchema = new mongoose.Schema({
  status: { type: String, enum: ['pending','cleared','blocked'], default: 'pending' },
  clearedBy: String,
  clearedAt: Date,
  notes: String,
  maintenanceDeposit: Number,
});

const PossessionClearanceSchema = new mongoose.Schema({
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true, unique: true },
  accountsClearance: { type: AccountsClearanceSchema, default: () => ({}) },
  legalClearance: { type: ClearanceStageSchema, default: () => ({}) },
  projectsClearance: { type: ProjectsClearanceSchema, default: () => ({}) },
  facilityClearance: { type: FacilityClearanceSchema, default: () => ({}) },
  overallStatus: { type: String, enum: ['pending','partial','cleared'], default: 'pending' },
  scheduledPossessionDate: Date, actualPossessionDate: Date,
}, { timestamps: true });

export default mongoose.models.PossessionClearance || mongoose.model('PossessionClearance', PossessionClearanceSchema);
