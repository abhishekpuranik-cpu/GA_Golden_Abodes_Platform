import mongoose from 'mongoose';

const UnitSchema = new mongoose.Schema({
  unitNumber: { type: String, required: true },
  tower: String, floor: Number, carpetArea: Number, saleableArea: Number,
  project: { type: String, enum: ['Golden HQ','NKG Wakad','Wakad GA','Anantam Signature','Anantam Waves','Paradise'], required: true },
  entity: { type: String, enum: ['PAD','NBD','NP','GV','GAPL','Suryakiran'], required: true },
  phase: String,
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  salesExecutive: String, channelPartner: String,
  bookingDate: Date, bookingAmount: Number, totalCost: Number,
  gstApplicable: Boolean, gstAmount: Number,
  paymentPlan: { type: String, enum: ['CLP','Flexi','Down Payment'] },
  currentStepNumber: { type: Number, default: 1 },
  overallStatus: { type: String, enum: ['active','possession_given','cancelled','on_hold'], default: 'active' },
  agreementDate: Date, registrationDate: Date, possessionDate: Date,
  crmExecutive: String,
}, { timestamps: true });

export default mongoose.models.Unit || mongoose.model('Unit', UnitSchema);
