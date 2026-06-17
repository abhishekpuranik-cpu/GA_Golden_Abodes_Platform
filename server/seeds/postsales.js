import { ensurePostSalesMongoose } from '../lib/postsales/mongoose.js';
import Customer from '../models/postsales/Customer.js';
import Unit from '../models/postsales/Unit.js';
import PipelineStep from '../models/postsales/PipelineStep.js';
import Demand from '../models/postsales/Demand.js';
import LoanTracker from '../models/postsales/LoanTracker.js';
import Ticket from '../models/postsales/Ticket.js';
import ConstructionMilestone from '../models/postsales/ConstructionMilestone.js';
import { STEPS } from '../lib/postsales/steps.js';
import { buildChecklist, computeDueDate } from '../lib/postsales/helpers.js';

const SEED_UNITS = [
  { unitNumber: 'A-1203', project: 'Golden HQ', entity: 'GAPL', customer: { name: 'Ramesh Mehta', fundingType: 'home_loan', phone: '9876500001', email: 'ramesh@example.com' }, currentStep: 6, overdueSteps: [4], crmExecutive: 'Priya Sharma' },
  { unitNumber: 'B-0804', project: 'Anantam Waves', entity: 'NP', customer: { name: 'Sunita Nair', fundingType: 'self_funded', phone: '9876500002', email: 'sunita@example.com' }, currentStep: 9, overdueSteps: [9], crmExecutive: 'Ankit Desai' },
  { unitNumber: 'C-0302', project: 'Paradise', entity: 'PAD', customer: { name: 'Vikram Joshi', fundingType: 'home_loan', phone: '9876500003', email: 'vikram@example.com' }, currentStep: 14, overdueSteps: [], crmExecutive: 'Priya Sharma', possessionDate: new Date('2025-11-15') },
  { unitNumber: 'A-0501', project: 'NKG Wakad', entity: 'PAD', customer: { name: 'Deepa Kulkarni', fundingType: 'home_loan', phone: '9876500004', email: 'deepa@example.com' }, currentStep: 3, overdueSteps: [], crmExecutive: 'Neha Patil' },
  { unitNumber: 'E-2104', project: 'Anantam Signature', entity: 'GV', customer: { name: 'Prakash Rao', fundingType: 'home_loan', phone: '9876500005', email: 'prakash@example.com' }, currentStep: 17, overdueSteps: [], crmExecutive: 'Ankit Desai' },
  { unitNumber: 'B-1102', project: 'Golden HQ', entity: 'GAPL', customer: { name: 'Meena Shah', fundingType: 'self_funded', phone: '9876500006', email: 'meena@example.com' }, currentStep: 2, overdueSteps: [], crmExecutive: 'Priya Sharma' },
];

function stepStatus(stepNum, currentStep, overdueSteps) {
  if (overdueSteps.includes(stepNum)) return 'overdue';
  if (stepNum < currentStep) return 'completed';
  if (stepNum === currentStep) return 'in_progress';
  return 'pending';
}

async function seedPostSalesData() {
  await ensurePostSalesMongoose();

  await Promise.all([
    Customer.deleteMany({}),
    Unit.deleteMany({}),
    PipelineStep.deleteMany({}),
    Demand.deleteMany({}),
    LoanTracker.deleteMany({}),
    Ticket.deleteMany({}),
    ConstructionMilestone.deleteMany({}),
  ]);

  const createdUnits = [];

  for (const seed of SEED_UNITS) {
    const customer = await Customer.create({
      ...seed.customer,
      kycStatus: 'partial',
    });

    const unit = await Unit.create({
      unitNumber: seed.unitNumber,
      project: seed.project,
      entity: seed.entity,
      customerId: customer._id,
      tower: seed.unitNumber.split('-')[0],
      floor: parseInt(seed.unitNumber.split('-')[1]?.slice(0, 1) || '1', 10),
      carpetArea: 850,
      saleableArea: 1050,
      bookingDate: new Date('2024-06-01'),
      bookingAmount: 500000,
      totalCost: 8500000,
      gstApplicable: true,
      paymentPlan: 'CLP',
      currentStepNumber: seed.currentStep,
      crmExecutive: seed.crmExecutive,
      salesExecutive: 'Sales Team A',
      possessionDate: seed.possessionDate,
      registrationDate: seed.currentStep >= 9 ? new Date('2025-03-01') : undefined,
    });

    const now = new Date();
    const stepDocs = STEPS.map((def) => {
      const status = stepStatus(def.number, seed.currentStep, seed.overdueSteps);
      const isOverdue = status === 'overdue';
      const isActive = status === 'in_progress';
      const isDone = status === 'completed';
      return {
        unitId: unit._id,
        stepNumber: def.number,
        stepName: def.name,
        phase: def.phase,
        status: isOverdue ? 'overdue' : status,
        assignedRole: def.assignedRole,
        triggerDate: def.number <= seed.currentStep ? now : undefined,
        dueDate: isActive || isOverdue ? computeDueDate(def, new Date(now.getTime() - 5 * 86400000)) : isDone ? now : undefined,
        completedDate: isDone ? now : undefined,
        slaBreach: isOverdue,
        slaBreachDays: isOverdue ? 3 : 0,
        checklist: buildChecklist(def, customer.fundingType),
      };
    });

    await PipelineStep.insertMany(stepDocs);
    createdUnits.push(unit);
  }

  const [u0, u1, u2, u3] = createdUnits;

  await Demand.insertMany([
    { unitId: u0._id, entity: u0.entity, milestoneName: 'Slab completion', clpPercent: 10, demandAmount: 850000, gstAmount: 42500, totalAmount: 892500, issuedDate: new Date('2025-01-15'), dueDate: new Date('2025-02-15'), paymentStatus: 'paid', paidAmount: 892500, paidDate: new Date('2025-02-10') },
    { unitId: u1._id, entity: u1.entity, milestoneName: 'Plinth completion', clpPercent: 5, demandAmount: 425000, gstAmount: 21250, totalAmount: 446250, issuedDate: new Date('2025-02-01'), dueDate: new Date('2025-03-01'), paymentStatus: 'partial', paidAmount: 200000 },
    { unitId: u2._id, entity: u2.entity, milestoneName: 'OC received', clpPercent: 15, demandAmount: 1275000, gstAmount: 63750, totalAmount: 1338750, issuedDate: new Date('2025-10-01'), dueDate: new Date('2025-11-01'), paymentStatus: 'pending', paidAmount: 0 },
    { unitId: u3._id, entity: u3.entity, milestoneName: 'Foundation', clpPercent: 8, demandAmount: 680000, gstAmount: 34000, totalAmount: 714000, issuedDate: new Date('2024-12-01'), dueDate: new Date('2025-01-01'), paymentStatus: 'overdue', paidAmount: 0 },
  ]);

  await LoanTracker.insertMany([
    { unitId: u0._id, fundingType: 'home_loan', bank: 'HDFC', rmName: 'Rajesh Kumar', loanAmount: 6000000, applicationStage: 'sanctioned', sanctionDate: new Date('2024-09-01'), sanctionAmount: 5800000, disbursements: [{ tranche: 1, amount: 1500000, date: new Date('2024-10-15') }] },
    { unitId: u2._id, fundingType: 'home_loan', bank: 'ICICI', rmName: 'Suresh Nair', loanAmount: 5500000, applicationStage: 'sanctioned', sanctionDate: new Date('2024-08-01'), disbursements: [{ tranche: 1, amount: 2000000, date: new Date('2024-09-01') }, { tranche: 2, amount: 1500000, date: new Date('2025-01-01') }] },
    { unitId: u1._id, fundingType: 'self_funded', ownContributionSchedule: [{ milestone: 'Booking', amount: 500000, dueDate: new Date('2024-06-15'), paidDate: new Date('2024-06-10'), status: 'paid' }, { milestone: 'Agreement', amount: 1000000, dueDate: new Date('2024-09-01'), status: 'pending' }] },
  ]);

  const raisedOld = new Date(Date.now() - 3 * 86400000);
  const raisedVeryOld = new Date(Date.now() - 10 * 86400000);

  await Ticket.insertMany([
    { unitId: u0._id, ticketNumber: 'GA-TKT-202506-001', type: 'query', category: 'payment', description: 'Customer asking about next CLP demand date', raisedBy: 'Ramesh Mehta', raisedAt: raisedOld, channel: 'call', status: 'acknowledged', acknowledgedAt: new Date() },
    { unitId: u1._id, ticketNumber: 'GA-TKT-202506-002', type: 'grievance', category: 'documentation', description: 'Delay in registered agreement copy', raisedBy: 'Sunita Nair', raisedAt: raisedVeryOld, channel: 'email', status: 'open', ackSlaBreach: true },
    { unitId: u2._id, ticketNumber: 'GA-TKT-202506-003', type: 'defect', category: 'construction', defectType: 'finishing', description: 'Bathroom tile grout cracking', raisedBy: 'Vikram Joshi', raisedAt: raisedVeryOld, channel: 'whatsapp', status: 'in_progress', dlpPeriodApplicable: true, dlpExpiryDate: new Date('2026-11-15'), resolutionSlaBreach: true, acknowledgedAt: new Date(Date.now() - 8 * 86400000) },
    { unitId: u3._id, ticketNumber: 'GA-TKT-202506-004', type: 'query', category: 'other', description: 'Welcome kit contents query', raisedBy: 'Deepa Kulkarni', raisedAt: new Date(), channel: 'call', status: 'open' },
  ]);

  await ConstructionMilestone.insertMany([
    { project: 'Golden HQ', tower: 'A', milestoneName: 'Slab 5 complete', clpPercent: 10, completedDate: new Date('2025-01-10'), loggedBy: 'Engineering', loggedAt: new Date('2025-01-10'), demandTriggerStatus: 'completed', demandsCreated: 2 },
    { project: 'Anantam Waves', tower: 'B', milestoneName: 'Plinth complete', clpPercent: 5, completedDate: new Date('2025-01-25'), loggedBy: 'Engineering', loggedAt: new Date('2025-01-25'), demandTriggerStatus: 'triggered', demandsCreated: 1 },
    { project: 'Paradise', tower: 'C', milestoneName: 'Brick work complete', clpPercent: 12, completedDate: new Date('2025-02-20'), loggedBy: 'Engineering', loggedAt: new Date('2025-02-20'), demandTriggerStatus: 'pending' },
    { project: 'NKG Wakad', tower: 'A', milestoneName: 'Foundation complete', clpPercent: 8, completedDate: new Date('2025-03-05'), loggedBy: 'Engineering', loggedAt: new Date('2025-03-05'), demandTriggerStatus: 'pending' },
    { project: 'Anantam Signature', tower: 'E', milestoneName: 'Structure complete', clpPercent: 20, completedDate: new Date('2025-02-01'), loggedBy: 'Engineering', loggedAt: new Date('2025-02-01'), demandTriggerStatus: 'pending' },
  ]);

  console.log('Post-sales seed complete: 6 customers, 6 units, pipeline steps, demands, loans, tickets, milestones.');
  return { ok: true };
}

import { fileURLToPath } from 'url';

export { seedPostSalesData };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedPostSalesData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
