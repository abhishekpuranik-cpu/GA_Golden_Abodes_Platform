import mongoose from 'mongoose';

const CustomerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: String, email: String, pan: String, aadhaar: String, address: String,
  coApplicant: { name: String, phone: String, pan: String, aadhaar: String, relationship: String },
  poa: { name: String, pan: String, relationship: String },
  maritalStatus: { type: String, enum: ['married','unmarried','divorced','widowed'] },
  fundingType: { type: String, enum: ['home_loan','self_funded'], required: true },
  kycStatus: { type: String, enum: ['pending','partial','complete'], default: 'pending' },
}, { timestamps: true });

export default mongoose.models.Customer || mongoose.model('Customer', CustomerSchema);
