import { Router } from 'express';
import XLSX from 'xlsx';
import HiringActivityLog from '../../models/hiring/ActivityLog.js';
import HiringRequisition from '../../models/hiring/Requisition.js';
import HiringCandidate from '../../models/hiring/Candidate.js';
import { ensureMongo } from '../../lib/mongo.js';
import { ObjectId } from 'mongodb';

const router = Router();

const ACTION_LABELS = {
  created: 'Created',
  updated: 'Updated',
  scrapped: 'Scrapped',
  soft_deleted: 'Deleted',
  metaview_search_started: 'Metaview search started',
  metaview_sync: 'Metaview sync',
  metaview_requirements_updated: 'Metaview requirements updated',
  headcount_filled: 'Headcount filled',
  hiring_fulfilled: 'Hiring fulfilled',
  stage_change: 'Stage change',
  hired: 'Hired',
  feedback: 'Feedback',
  status_change: 'Status change'
};

async function userEmailMap(ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return {};
  const db = await ensureMongo();
  const rows = await db.collection('auth_users').find(
    { _id: { $in: unique.map((id) => new ObjectId(id)) } },
    { projection: { email: 1, name: 1 } }
  ).toArray();
  const map = {};
  rows.forEach((u) => {
    map[String(u._id)] = u.email || u.name || String(u._id);
  });
  return map;
}

async function enrichRows(logs) {
  const reqIds = logs.filter((l) => l.refType === 'requisition').map((l) => l.refId);
  const candIds = logs.filter((l) => l.refType === 'candidate').map((l) => l.refId);
  const [reqs, cands, users] = await Promise.all([
    reqIds.length
      ? HiringRequisition.find({ _id: { $in: reqIds } }).select('reqCode role projectName location entityTag').lean()
      : [],
    candIds.length
      ? HiringCandidate.find({ _id: { $in: candIds } }).select('name requisitionId').lean()
      : [],
    userEmailMap(logs.map((l) => l.by))
  ]);
  const reqMap = Object.fromEntries(reqs.map((r) => [String(r._id), r]));
  const candMap = Object.fromEntries(cands.map((c) => [String(c._id), c]));
  const candReqIds = [...new Set(cands.map((c) => String(c.requisitionId)).filter(Boolean))];
  const extraReqs = candReqIds.length
    ? await HiringRequisition.find({ _id: { $in: candReqIds } }).select('reqCode role').lean()
    : [];
  extraReqs.forEach((r) => { reqMap[String(r._id)] = r; });

  return logs.map((l) => {
    const at = l.at ? new Date(l.at) : null;
    let context = '';
    if (l.refType === 'requisition' && reqMap[String(l.refId)]) {
      const r = reqMap[String(l.refId)];
      context = `${r.reqCode} — ${r.role}`;
    } else if (l.refType === 'candidate' && candMap[String(l.refId)]) {
      const c = candMap[String(l.refId)];
      const r = reqMap[String(c.requisitionId)];
      context = `${c.name}${r ? ` (${r.reqCode})` : ''}`;
    }
    return {
      id: String(l._id),
      at: at?.toISOString() || '',
      atDisplay: at ? at.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '',
      refType: l.refType,
      action: l.action,
      actionLabel: ACTION_LABELS[l.action] || l.action,
      detail: l.detail || '',
      context,
      by: l.by ? (users[String(l.by)] || String(l.by)) : 'System'
    };
  });
}

function buildFilter(query) {
  const filter = {};
  if (query.refType) filter.refType = query.refType;
  if (query.action) filter.action = query.action;
  if (query.from || query.to) {
    filter.at = {};
    if (query.from) filter.at.$gte = new Date(query.from);
    if (query.to) filter.at.$lte = new Date(query.to);
  }
  if (query.requisitionId) {
    filter.$or = [
      { refType: 'requisition', refId: new mongoose.Types.ObjectId(query.requisitionId) }
    ];
  }
  return filter;
}

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const skip = (page - 1) * limit;
    let filter = buildFilter(req.query);

    if (req.query.requisitionId && !filter.$or) {
      filter = buildFilter(req.query);
    } else if (req.query.requisitionId) {
      const candIds = await HiringCandidate.find({
        requisitionId: req.query.requisitionId,
        isDeleted: false
      }).select('_id').lean();
      filter.$or.push(
        { refType: 'candidate', refId: { $in: candIds.map((c) => c._id) } },
        { refType: 'offer', refId: { $in: [] } }
      );
    }

    const [items, total] = await Promise.all([
      HiringActivityLog.find(filter).sort({ at: -1 }).skip(skip).limit(limit).lean(),
      HiringActivityLog.countDocuments(filter)
    ]);
    const rows = await enrichRows(items);
    res.json({ activities: rows, page, limit, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/export', async (req, res) => {
  try {
    const filter = buildFilter(req.query);
    const items = await HiringActivityLog.find(filter).sort({ at: -1 }).limit(10000).lean();
    const rows = await enrichRows(items);
    const sheetRows = rows.map((r) => ({
      Timestamp: r.atDisplay,
      'Entity type': r.refType,
      Context: r.context,
      Action: r.actionLabel,
      Detail: r.detail,
      'By': r.by
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetRows.length ? sheetRows : [{ Note: 'No activities in selected range' }]);
    XLSX.utils.book_append_sheet(wb, ws, 'Activity log');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="hiring-activity-log-${stamp}.xlsx"`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
