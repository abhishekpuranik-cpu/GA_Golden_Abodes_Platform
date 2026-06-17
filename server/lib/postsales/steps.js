export const PHASES = {
  booking_handoff: { label: "Booking handoff",     color: "#185FA5" },
  doc_loan:        { label: "Documentation & loan", color: "#3B6D11" },
  agreement:       { label: "Agreement",            color: "#854F0B" },
  post_reg:        { label: "Post-registration",    color: "#534AB7" },
  clp:             { label: "CLP demands",          color: "#993C1D" },
  servicing:       { label: "Servicing",            color: "#993556" },
  possession:      { label: "Possession",           color: "#0F6E56" },
  chs:             { label: "CHS formation",        color: "#5F5E5A" },
  post_handover:   { label: "Post-handover",        color: "#3C3489" },
};

export const ESCALATION_MATRIX = {
  sla_breach_1_day:   { level: 1, label: "1-day SLA breach → CRM Head" },
  sla_breach_3_day:   { level: 2, label: "3-day SLA breach → Department Head" },
  sla_breach_7_day:   { level: 3, label: "7-day SLA breach → Directors (Amar / Gaurav / Abhishek)" },
  payment_overdue:    { level: 2, label: "Payment overdue → Accounts + Management" },
  doc_missing_afs:    { level: 2, label: "Docs missing before AFS → Legal + Management" },
  customer_grievance: { level: 2, label: "Critical grievance → Department Head" },
  engineering_delay:  { level: 3, label: "Milestone delay → Directors" },
};

export const ENTITIES = ["PAD", "NBD", "NP", "GV", "GAPL", "Suryakiran"];

export const PROJECTS = [
  { name: "Golden HQ",         entity: "GAPL", location: "PCMC, Pune" },
  { name: "NKG Wakad",         entity: "PAD",  location: "Wakad, Pune" },
  { name: "Wakad GA",          entity: "NBD",  location: "Wakad, Pune" },
  { name: "Anantam Signature", entity: "GV",   location: "Goa" },
  { name: "Anantam Waves",     entity: "NP",   location: "Dona Paula, Goa" },
  { name: "Paradise",          entity: "PAD",  location: "Goa" },
];

export const STEPS = [
  {
    number: 1, name: "Booking confirmation to CRM", phase: "booking_handoff",
    assignedRole: "Sales Executive", slaDays: 1, slaUnit: "calendar days",
    triggerEvent: "Booking amount received", escalation: "sla_breach_1_day",
    checklist: ["Booking form — duly filled and signed", "Cost sheet attached", "Payment receipt / transaction details", "Customer KYC documents", "Email sent to CRM inbox with unit number in subject"]
  },
  {
    number: 2, name: "Update booking details in CRM", phase: "booking_handoff",
    assignedRole: "CRM Executive", slaDays: 1, slaUnit: "working days",
    triggerEvent: "Booking confirmation email received", escalation: "sla_breach_1_day",
    checklist: ["Customer name and contact details entered", "Co-applicant details entered", "Project name and entity tagged", "Tower / unit number confirmed", "Booking date recorded", "Booking amount recorded", "Total unit cost entered", "Payment plan selected", "Funding type selected", "Sales Executive recorded", "Channel Partner details recorded"]
  },
  {
    number: 3, name: "Welcome call and email to customer", phase: "booking_handoff",
    assignedRole: "CRM Executive", slaDays: 1, slaUnit: "working days",
    triggerEvent: "Booking updated in CRM", escalation: "sla_breach_1_day",
    checklist: ["Customer welcomed and congratulated", "CRM Executive introduced as dedicated POC", "Booking details verified on call", "Home loan status discussed", "Process, timelines, milestones explained", "Welcome email sent"]
  },
  {
    number: 4, name: "Home loan / self-funded coordination", phase: "doc_loan",
    assignedRole: "CRM Executive", slaDays: 15, slaUnit: "working days",
    triggerEvent: "Booking confirmed in CRM", escalation: "sla_breach_3_day",
    fundingTypeSplit: true,
    homeLoanChecklist: ["Home loan application form collected", "Customer KYC docs collected for bank", "Approved plans shared with bank", "RERA registration details shared", "Project approvals shared", "Cost sheet shared", "Allotment letter shared", "Loan application submitted to bank RM", "Property valuation coordinated", "Loan application status tracked", "Loan Sanction Letter received", "Sanction details updated in CRM"],
    selfFundedChecklist: ["Own contribution schedule prepared by Accounts", "Schedule shared with customer", "Self-declaration form collected", "Payment milestone dates confirmed", "Own contribution schedule updated in CRM"]
  },
  {
    number: 5, name: "Document collection for agreement", phase: "doc_loan",
    assignedRole: "CRM Executive", slaDays: 10, slaUnit: "working days",
    triggerEvent: "Booking confirmed in CRM", escalation: "doc_missing_afs",
    checklist: ["PAN card — primary applicant", "Aadhaar card — primary applicant", "Photographs — primary applicant", "PAN card — co-applicant", "Aadhaar card — co-applicant", "Photographs — co-applicant", "POA documents (if applicable)", "Marital status proof (if married)", "Name and address verified against KYC", "All documents uploaded to Drive"]
  },
  {
    number: 6, name: "Agreement preparation", phase: "agreement",
    assignedRole: "CRM Executive", slaDays: 8, slaUnit: "working days",
    triggerEvent: "Step 5 complete + loan sanction + payments", escalation: "doc_missing_afs",
    blockedBy: [5],
    checklist: ["All applicant details compiled", "KYC documents verified complete", "Details shared with Advocate", "Draft agreement reviewed for accuracy", "Internal discrepancies resolved", "Draft shared with customer", "Execution timeline confirmed", "Agreement checklist prepared for management"]
  },
  {
    number: 7, name: "Own contribution communication", phase: "agreement",
    assignedRole: "CRM Executive", slaDays: 2, slaUnit: "working days",
    triggerEvent: "Loan Sanction Letter received", escalation: "sla_breach_1_day",
    checklist: ["Own contribution calculation prepared by Accounts", "Calculation reviewed by CRM Executive", "Bifurcation communicated to customer", "Payment demand letter issued if required", "Own contribution updated in CRM", "Accounts Team informed"]
  },
  {
    number: 8, name: "Agreement to sale execution", phase: "agreement",
    assignedRole: "CRM Executive", slaDays: 30, slaUnit: "calendar days from booking",
    triggerEvent: "Step 6 approved + Step 7 complete", escalation: "sla_breach_7_day",
    blockedBy: [6, 7],
    checklist: ["Date confirmed with applicant and co-applicant", "Reminder sent before appointment", "Internal departments coordinated", "Agreement executed and signed", "Registration appointment booked", "Agreement registered at Sub-Registrar"]
  },
  {
    number: 9, name: "Registered agreement receipt and TDS", phase: "post_reg",
    assignedRole: "CRM Executive", slaDays: 3, slaUnit: "working days",
    triggerEvent: "Agreement registered", escalation: "sla_breach_1_day",
    checklist: ["Follow-up with Advocate for registered copy", "Soft copy received", "Hard copy received", "Registered agreement uploaded to Drive", "Shared with customer", "Registration status updated", "Customer informed of TDS obligation (Sec 194-IA)", "Seller PAN and property value shared", "Customer guided to file Form 26QB", "TDS deadline confirmed — 30 days from registration", "Form 16B requested", "CA Akshay Lad informed if TDS delayed beyond 30 days"]
  },
  {
    number: 10, name: "Disbursement documents to bank", phase: "post_reg",
    assignedRole: "CRM Executive", slaDays: 3, slaUnit: "working days",
    triggerEvent: "Registered agreement received", escalation: "sla_breach_1_day",
    checklist: ["NOC prepared on entity-specific letterhead", "Payment receipts compiled", "Registered agreement copy included", "Handover letter prepared", "Disbursement package shared with bank", "Document receipt confirmed by bank"]
  },
  {
    number: 11, name: "First disbursement", phase: "post_reg",
    assignedRole: "CRM Executive", slaDays: 10, slaUnit: "working days",
    triggerEvent: "Disbursement documents submitted", escalation: "payment_overdue",
    checklist: ["Follow-up with bank for processing", "Customer queries addressed", "Disbursement amount confirmed with Accounts", "First tranche received and updated in CRM", "Receipt issued", "Accounts reconciliation updated"]
  },
  {
    number: 12, name: "CLP demand letter issuance", phase: "clp",
    assignedRole: "CRM Executive", slaDays: 2, slaUnit: "working days",
    triggerEvent: "Engineering logs milestone completion in system", escalation: "engineering_delay",
    checklist: ["Milestone completion logged by Engineering", "Demand amount calculated (CLP % × cost + GST)", "Demand letter on entity-specific letterhead", "Architect certificate attached", "Demand sent to customer (email + WhatsApp)", "Demand sent to bank RM", "Follow-up initiated", "CRM updated", "Accounts informed", "Payment received and updated"]
  },
  {
    number: 13, name: "Customer query and grievance handling", phase: "servicing",
    assignedRole: "CRM Executive", slaAck: 1, slaResolution: 7,
    triggerEvent: "Ongoing — customer contact", escalation: "customer_grievance",
    checklist: ["Query received and acknowledged within 24 hours", "Ticket created with category and type", "Relevant department coordinated", "Resolution provided within SLA", "Critical issues escalated", "Customer satisfaction confirmed", "Ticket closed and updated"]
  },
  {
    number: 14, name: "Possession checklist and handover", phase: "possession",
    assignedRole: "CRM Executive",
    triggerEvent: "OC/CC received + all dues cleared", escalation: "sla_breach_7_day",
    clearanceSequence: ["Accounts", "Legal", "Projects", "Facility Mgmt"],
    checklist: ["OC / CC received and uploaded", "Accounts clearance obtained", "Legal clearance obtained", "Projects clearance obtained (snag list cleared)", "Facility Management clearance obtained", "Possession date scheduled", "Unit inspection conducted", "Snag list resolved", "Handover ceremony conducted", "Possession letter signed", "Welcome kit handed over", "Keys handed over", "Possession acknowledgement obtained", "Photographs taken", "CRM updated", "Customer feedback shared with management"]
  },
  {
    number: 15, name: "Property tax assessment assistance", phase: "possession",
    assignedRole: "CRM Executive", slaDays: 30, slaUnit: "calendar days from possession",
    triggerEvent: "Possession handed over", escalation: "sla_breach_7_day",
    checklist: ["Index II copy provided", "Aadhaar card copy provided", "Customer details compiled", "Property tax assessment form assisted", "PCMC / municipal authority coordination", "Assessment status tracked and customer updated"]
  },
  {
    number: 16, name: "Initiate CHS formation", phase: "chs",
    assignedRole: "CRM Executive",
    triggerEvent: "Management approval + flat owners available", escalation: "sla_breach_7_day",
    checklist: ["Consultant appointed by management", "19-document checklist initiated", "Flat owner details gathered", "Society meeting organized", "Member consent obtained", "CHS application submitted to Registrar"]
  },
  {
    number: 17, name: "CHS registration and bank account", phase: "chs",
    assignedRole: "CRM Executive", slaDays: 30, slaUnit: "working days",
    triggerEvent: "CHS application submitted", escalation: "sla_breach_7_day",
    checklist: ["CHS Registration Certificate received", "Registration number recorded", "CHS PAN card obtained", "Society bye-laws submitted to bank", "KYC of authorized signatories submitted", "Bank account resolution submitted", "CHS bank account opened and number recorded"]
  },
  {
    number: 18, name: "Maintenance fund transfer to CHS", phase: "chs",
    assignedRole: "CRM Executive", slaDays: 30, slaUnit: "working days",
    triggerEvent: "CHS bank account opened + management approval", escalation: "sla_breach_7_day",
    checklist: ["Maintenance records verified by Accounts", "Reconciliation statement prepared", "Management approval obtained", "Amount transferred to CHS account", "Transfer statement shared with committee", "Transfer recorded in CRM"]
  },
  {
    number: 19, name: "Helpdesk / call center setup", phase: "post_handover",
    assignedRole: "CRM Executive",
    triggerEvent: "Prior to possession handover", escalation: "sla_breach_3_day",
    checklist: ["Dedicated helpdesk number allocated", "Helpdesk team briefed", "Query categories defined (parking, maintenance, flat, services)", "Response SLAs set per category", "Helpdesk number communicated before possession"]
  },
  {
    number: 20, name: "Defects Liability Period management", phase: "post_handover",
    assignedRole: "CRM Executive",
    triggerEvent: "Ongoing from possession date", escalation: "customer_grievance",
    defectCategories: [
      { type: "structural", label: "Structural", dlp: "5 years (MahaRERA)", examples: "Cracks, seepage, RCC defects" },
      { type: "finishing",  label: "Finishing",  dlp: "1 year",             examples: "Plaster, paint, tiles, flooring" },
      { type: "services",   label: "Services",   dlp: "1 year",             examples: "Electrical, plumbing, lifts, waterproofing" },
    ],
    checklist: ["DLP start date recorded (= possession date)", "Defect complaint received and categorized", "Defect type and DLP applicability confirmed", "Projects / Quality / Maintenance informed", "Site inspection conducted", "Rectification scheduled", "Rectification completed and verified", "Customer notified", "Defect record updated with photographs"]
  },
];

export default STEPS;
