import mongoose from 'mongoose';

const DOC_TYPES = ['booking_form','cost_sheet','payment_receipt','pan_card','aadhaar_card','photograph','address_proof','marital_proof','loan_application','approved_plan','rera_certificate','project_approvals','loan_sanction_letter','allotment_letter','agreement_draft','registered_agreement','self_declaration','form_26QB','form_16B','tds_challan','noc','handover_letter','demand_letter_clp','architect_certificate','oc_cc','possession_checklist','possession_letter','possession_acknowledgement','index_ii','property_tax_form','chs_application','chs_registration_cert','society_bank_account_details','maintenance_reconciliation_stmt'];
const DocumentSchema = new mongoose.Schema({
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  stepNumber: Number,
  docType: { type: String, enum: DOC_TYPES },
  label: String,
  status: { type: String, enum: ['pending','received','verified','uploaded','rejected'], default: 'pending' },
  receivedDate: Date, verifiedDate: Date, verifiedBy: String,
  driveLink: String,
  fileId: String,
  fileName: String,
  mimeType: String,
  fileSize: Number,
  uploadedBy: String,
  notes: String,
  applicant: { type: String, enum: ['primary','co_applicant','poa'] },
}, { timestamps: true });

export default mongoose.models.Document || mongoose.model('Document', DocumentSchema);
