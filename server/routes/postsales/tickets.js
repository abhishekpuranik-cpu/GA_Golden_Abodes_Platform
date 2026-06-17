import { Router } from 'express';
import Ticket from '../../models/postsales/Ticket.js';
import Unit from '../../models/postsales/Unit.js';

const router = Router();

async function nextTicketNumber() {
  const now = new Date();
  const prefix = `GA-TKT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const count = await Ticket.countDocuments({ createdAt: { $gte: monthStart } });
  return `${prefix}-${String(count + 1).padStart(3, '0')}`;
}

function addYears(date, years) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.unitId) filter.unitId = req.query.unitId;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.type) filter.type = req.query.type;
    if (req.query.slaBreach === 'true') {
      filter.$or = [{ ackSlaBreach: true }, { resolutionSlaBreach: true }];
    }

    const tickets = await Ticket.find(filter).sort({ raisedAt: -1 }).lean();
    const unitIds = [...new Set(tickets.map((t) => String(t.unitId)))];
    const units = await Unit.find({ _id: { $in: unitIds } }).populate('customerId').lean();
    const unitMap = Object.fromEntries(units.map((u) => [String(u._id), u]));

    const enriched = tickets.map((t) => {
      const u = unitMap[String(t.unitId)];
      return {
        ...t,
        unitNumber: u?.unitNumber,
        project: u?.project,
        customerName: u?.customerId?.name,
      };
    });

    const ackBreachCount = tickets.filter((t) => t.ackSlaBreach).length;
    const resBreachCount = tickets.filter((t) => t.resolutionSlaBreach).length;

    res.json({ tickets: enriched, ackBreachCount, resBreachCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id).lean();
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    const unit = await Unit.findById(ticket.unitId).populate('customerId').lean();
    res.json({ ...ticket, unit, customerName: unit?.customerId?.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { unitId, type, category, defectType, description, raisedBy, channel } = req.body;
    const unit = await Unit.findById(unitId).lean();
    if (!unit) return res.status(404).json({ error: 'Unit not found' });

    const ticketNumber = await nextTicketNumber();
    const payload = {
      unitId,
      ticketNumber,
      type,
      category,
      defectType: type === 'defect' ? defectType : undefined,
      description,
      raisedBy,
      channel,
      raisedAt: new Date(),
      activityLog: [{ action: 'created', by: raisedBy || 'system', at: new Date(), note: description }],
    };

    if (type === 'defect' && unit.possessionDate) {
      payload.dlpPeriodApplicable = true;
      const years = defectType === 'structural' ? 5 : 1;
      payload.dlpExpiryDate = addYears(unit.possessionDate, years);
    }

    const ticket = await Ticket.create(payload);
    res.status(201).json(ticket);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    const { status, assignedTo, department, escalatedTo, resolutionNotes, by } = req.body;
    const log = [];

    if (status && status !== ticket.status) {
      ticket.status = status;
      log.push({ action: `status → ${status}`, by: by || 'system', at: new Date() });
      if (status === 'acknowledged' && !ticket.acknowledgedAt) ticket.acknowledgedAt = new Date();
      if (status === 'resolved' && !ticket.resolvedAt) ticket.resolvedAt = new Date();
    }
    if (assignedTo !== undefined) {
      ticket.assignedTo = assignedTo;
      log.push({ action: `assigned to ${assignedTo}`, by: by || 'system', at: new Date() });
    }
    if (department !== undefined) ticket.department = department;
    if (escalatedTo) {
      ticket.escalatedTo = escalatedTo;
      ticket.escalationDate = new Date();
      ticket.status = 'escalated';
      log.push({ action: `escalated to ${escalatedTo}`, by: by || 'system', at: new Date(), note: req.body.escalationReason });
    }
    if (resolutionNotes !== undefined) ticket.resolutionNotes = resolutionNotes;

    if (log.length) ticket.activityLog.push(...log);
    await ticket.save();
    res.json(ticket);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
