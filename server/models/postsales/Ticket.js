import mongoose from 'mongoose';

const ActivitySchema = new mongoose.Schema({ action: String, by: String, at: Date, note: String });
const TicketSchema = new mongoose.Schema({
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  ticketNumber: { type: String, unique: true },
  type: { type: String, enum: ['query','grievance','defect'] },
  category: { type: String, enum: ['payment','documentation','construction','legal','other'] },
  defectType: { type: String, enum: ['structural','finishing','services', null] },
  dlpPeriodApplicable: Boolean, dlpExpiryDate: Date,
  description: String, raisedBy: String, raisedAt: Date,
  channel: { type: String, enum: ['call','email','whatsapp','helpdesk'] },
  status: { type: String, enum: ['open','acknowledged','in_progress','resolved','escalated','closed'], default: 'open' },
  acknowledgedAt: Date, resolvedAt: Date,
  ackSlaBreach: { type: Boolean, default: false },
  resolutionSlaBreach: { type: Boolean, default: false },
  assignedTo: String, department: String,
  escalatedTo: String, escalationDate: Date, resolutionNotes: String,
  activityLog: [ActivitySchema],
}, { timestamps: true });
TicketSchema.index({ unitId: 1 });
TicketSchema.index({ status: 1, ackSlaBreach: 1 });

export default mongoose.models.Ticket || mongoose.model('Ticket', TicketSchema);
