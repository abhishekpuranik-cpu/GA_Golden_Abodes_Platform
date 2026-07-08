import { Router } from 'express';
import mongoose from 'mongoose';
import HiringRequisition from '../../models/hiring/Requisition.js';
import HiringCandidate from '../../models/hiring/Candidate.js';
import HiringOffer from '../../models/hiring/Offer.js';
import { nextReqCode } from '../../lib/hiring/counter.js';
import { attachHiringUser, actorId, logHiringActivity } from '../../lib/hiring/activity.js';
import { requireHiringWrite } from '../../lib/hiring/access.js';
import { requireEntityTag, assertPaise, notDeletedFilter } from '../../lib/hiring/validate.js';
import { allStageNumbers } from '../../lib/hiring/stages.js';
import { mergeMetaviewCandidate } from '../../lib/hiring/importService.js';
import {
  startSearch, pullCandidates, getSearchStatus, refineSearch,
  metaviewWebSearchUrl, sourcingModeAvailable, metaviewConfigured
} from '../../lib/hiring/metaviewService.js';
import { validateBody } from '../../lib/hiring/validateBody.js';
import { metaviewSourceLimiter, metaviewSyncLimiter } from '../../lib/hiring/rateLimit.js';
import { reqAttachmentUpload } from '../../lib/hiring/reqUpload.js';
import { markRequisitionFulfilled } from '../../lib/hiring/fulfillment.js';

const router = Router();

function stripAttachments(doc) {
  if (!doc) return doc;
  const o = { ...doc };
  if (Array.isArray(o.attachments)) {
    o.attachmentsMeta = o.attachments.map((a) => ({
      kind: a.kind,
      filename: a.filename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      uploadedAt: a.uploadedAt
    }));
    delete o.attachments;
  }
  return o;
}

function parseAttachmentsFromBody(body, files) {
  const attachments = [];
  const add = (kind, file) => {
    if (!file?.buffer?.length) return;
    attachments.push({
      kind,
      filename: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      data: file.buffer,
      uploadedAt: new Date()
    });
  };
  if (files?.jd?.[0]) add('jd', files.jd[0]);
  if (files?.email?.[0]) add('email', files.email[0]);
  return attachments;
}

function parseJsonFields(body) {
  const out = { ...body };
  ['bandMinPaise', 'bandMaxPaise', 'experienceMinYears', 'experienceMaxYears', 'headcount'].forEach((k) => {
    if (out[k] !== undefined && out[k] !== '') out[k] = Number(out[k]);
  });
  if (out.headcount === undefined || Number.isNaN(out.headcount)) out.headcount = 1;
  return out;
}

router.use(attachHiringUser);

async function pipelineCounts(requisitionId) {
  const stages = allStageNumbers();
  const counts = Object.fromEntries(stages.map((s) => [s, 0]));
  const rows = await HiringCandidate.aggregate([
    { $match: { requisitionId: new mongoose.Types.ObjectId(requisitionId), isDeleted: false } },
    { $group: { _id: '$currentStageNumber', count: { $sum: 1 } } }
  ]);
  rows.forEach((r) => { counts[r._id] = r.count; });
  return counts;
}

async function canCloseRequisition(requisitionId) {
  const atOffer = await HiringCandidate.find({
    requisitionId,
    isDeleted: false,
    currentStageNumber: 6
  }).select('_id').lean();
  if (!atOffer.length) return { ok: true };
  const ids = atOffer.map((c) => c._id);
  const sent = await HiringOffer.countDocuments({
    candidateId: { $in: ids },
    status: 'Sent',
    isDeleted: false
  });
  if (sent > 0) {
    return { ok: false, reason: 'Cannot close while candidates have Sent offers' };
  }
  return { ok: true };
}

router.get('/', async (req, res) => {
  try {
    const filter = notDeletedFilter();
    if (req.query.status) filter.status = req.query.status;
    if (req.query.entityTag) filter.entityTag = req.query.entityTag;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      HiringRequisition.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      HiringRequisition.countDocuments(filter)
    ]);
    res.json({ requisitions: items.map(stripAttachments), page, limit, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/attachments/:kind', async (req, res) => {
  try {
    const kind = req.params.kind;
    if (!['jd', 'email'].includes(kind)) return res.status(400).json({ error: 'kind must be jd or email' });
    const doc = await HiringRequisition.findOne(notDeletedFilter({ _id: req.params.id }));
    if (!doc) return res.status(404).json({ error: 'Requisition not found' });
    const att = (doc.attachments || []).find((a) => a.kind === kind);
    if (!att) return res.status(404).json({ error: 'Attachment not found' });
    res.setHeader('Content-Type', att.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${att.filename}"`);
    res.send(att.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const reqDoc = await HiringRequisition.findOne(notDeletedFilter({ _id: req.params.id })).lean();
    if (!reqDoc) return res.status(404).json({ error: 'Requisition not found' });
    const pipeline = await pipelineCounts(reqDoc._id);
    const hired = pipeline[7] || 0;
    res.json({
      ...stripAttachments(reqDoc),
      pipeline,
      filledHeadcount: hired,
      headcountRemaining: Math.max(0, (reqDoc.headcount || 1) - hired),
      promptClosure: hired >= (reqDoc.headcount || 1) && reqDoc.status !== 'Hiring Fulfilled',
      canMarkFulfilled: !['Hiring Fulfilled', 'Cancelled', 'Closed'].includes(reqDoc.status),
      metaviewUrl: metaviewWebSearchUrl(reqDoc.metaviewSearchId)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireHiringWrite, reqAttachmentUpload.fields([
  { name: 'jd', maxCount: 1 },
  { name: 'email', maxCount: 1 }
]), async (req, res) => {
  try {
    const body = parseJsonFields(req.body);
    const entityTag = requireEntityTag(body, res);
    if (!entityTag) return;
    if (!body.role?.trim()) return res.status(400).json({ error: 'role is required' });
    if (!body.location?.trim()) return res.status(400).json({ error: 'location is required' });
    if (!body.brief?.trim()) return res.status(400).json({ error: 'brief is required' });
    const reqCode = await nextReqCode();
    const createdBy = actorId(req);
    if (!createdBy) return res.status(401).json({ error: 'Authentication required' });
    const attachments = parseAttachmentsFromBody(body, req.files);
    const doc = await HiringRequisition.create({
      reqCode,
      entityTag,
      role: body.role,
      department: body.department,
      projectName: body.projectName,
      location: body.location,
      bandMinPaise: assertPaise(body.bandMinPaise, 'bandMinPaise'),
      bandMaxPaise: assertPaise(body.bandMaxPaise, 'bandMaxPaise'),
      experienceMinYears: body.experienceMinYears,
      experienceMaxYears: body.experienceMaxYears,
      brief: body.brief,
      headcount: body.headcount ?? 1,
      status: body.status || 'Draft',
      sourcingMode: metaviewConfigured() ? (body.sourcingMode || 'manual') : 'manual',
      attachments,
      createdBy: new mongoose.Types.ObjectId(createdBy)
    });
    await logHiringActivity({
      refType: 'requisition',
      refId: doc._id,
      action: 'created',
      detail: `${reqCode}${attachments.length ? ` · ${attachments.map((a) => a.kind).join(', ')} attached` : ''}`,
      by: createdBy
    });
    res.status(201).json(stripAttachments(doc.toObject()));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', requireHiringWrite, validateBody([
  'role', 'department', 'projectName', 'location', 'brief', 'headcount', 'status',
  'closedReason', 'sourcingMode', 'metaviewSearchId', 'bandMinPaise', 'bandMaxPaise',
  'experienceMinYears', 'experienceMaxYears', 'entityTag', 'pushToMetaview'
]), async (req, res) => {
  try {
    const doc = await HiringRequisition.findOne(notDeletedFilter({ _id: req.params.id }));
    if (!doc) return res.status(404).json({ error: 'Requisition not found' });
    const allowed = ['role', 'department', 'projectName', 'location', 'brief', 'headcount', 'status', 'closedReason', 'sourcingMode', 'metaviewSearchId'];
    if (req.body.status === 'Closed') {
      const check = await canCloseRequisition(doc._id);
      if (!check.ok) return res.status(422).json({ error: check.reason });
    }
    for (const key of allowed) {
      if (req.body[key] !== undefined) doc[key] = req.body[key];
    }
    if (req.body.bandMinPaise !== undefined) doc.bandMinPaise = assertPaise(req.body.bandMinPaise, 'bandMinPaise');
    if (req.body.bandMaxPaise !== undefined) doc.bandMaxPaise = assertPaise(req.body.bandMaxPaise, 'bandMaxPaise');
    if (req.body.experienceMinYears !== undefined) doc.experienceMinYears = req.body.experienceMinYears;
    if (req.body.experienceMaxYears !== undefined) doc.experienceMaxYears = req.body.experienceMaxYears;
    if (req.body.entityTag) {
      const tag = requireEntityTag(req.body, res);
      if (!tag) return;
      doc.entityTag = tag;
    }
    await doc.save();

    let metaviewUpdated = false;
    if (req.body.pushToMetaview && doc.metaviewSearchId && metaviewConfigured()) {
      await refineSearch(doc.metaviewSearchId, doc);
      metaviewUpdated = true;
      await logHiringActivity({
        refType: 'requisition',
        refId: doc._id,
        action: 'metaview_requirements_updated',
        detail: doc.metaviewSearchId,
        by: actorId(req)
      });
    }

    await logHiringActivity({
      refType: 'requisition',
      refId: doc._id,
      action: 'updated',
      detail: doc.status,
      by: actorId(req)
    });
    res.json({
      ...doc.toObject(),
      metaviewUpdated,
      metaviewUrl: metaviewWebSearchUrl(doc.metaviewSearchId)
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/fulfill', requireHiringWrite, async (req, res) => {
  try {
    const doc = await HiringRequisition.findOne(notDeletedFilter({ _id: req.params.id }));
    if (!doc) return res.status(404).json({ error: 'Requisition not found' });
    if (doc.status === 'Hiring Fulfilled') {
      return res.json(stripAttachments(doc.toObject()));
    }
    if (doc.status === 'Cancelled') {
      return res.status(422).json({ error: 'Cannot fulfill a cancelled requisition' });
    }
    const updated = await markRequisitionFulfilled(doc, { by: actorId(req), reason: 'manual' });
    const pipeline = await pipelineCounts(updated._id);
    const hired = pipeline[7] || 0;
    res.json({
      ...stripAttachments(updated.toObject()),
      pipeline,
      filledHeadcount: hired,
      headcountRemaining: Math.max(0, (updated.headcount || 1) - hired),
      promptClosure: false,
      canMarkFulfilled: false
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', requireHiringWrite, async (req, res) => {
  try {
    const doc = await HiringRequisition.findOne(notDeletedFilter({ _id: req.params.id }));
    if (!doc) return res.status(404).json({ error: 'Requisition not found' });
    const mode = String(req.query.mode || req.body?.mode || 'soft').toLowerCase();
    const force = req.query.force === '1' || req.query.force === 'true' || !!req.body?.force;
    const closedReason = req.body?.reason || req.query.reason || 'Scrapped by hiring manager';

    if (mode === 'scrap' || mode === 'cancel') {
      const check = await canCloseRequisition(doc._id);
      if (!check.ok && !force) {
        return res.status(422).json({
          error: check.reason + '. Confirm scrap with force=true to cancel anyway.',
          code: 'SENT_OFFERS'
        });
      }
      doc.status = 'Cancelled';
      doc.closedReason = closedReason;
      await doc.save();
      await logHiringActivity({
        refType: 'requisition',
        refId: doc._id,
        action: 'scrapped',
        detail: doc.closedReason,
        by: actorId(req)
      });
      return res.json({
        ok: true,
        mode: 'scrap',
        requisition: doc,
        metaviewUrl: metaviewWebSearchUrl(doc.metaviewSearchId)
      });
    }

    doc.isDeleted = true;
    doc.deletedAt = new Date();
    if (doc.status !== 'Cancelled' && doc.status !== 'Closed') {
      doc.status = 'Cancelled';
      doc.closedReason = doc.closedReason || 'Deleted from hiring board';
    }
    await doc.save();
    await logHiringActivity({
      refType: 'requisition',
      refId: doc._id,
      action: 'soft_deleted',
      by: actorId(req)
    });
    res.json({ ok: true, mode: 'delete' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/source', requireHiringWrite, metaviewSourceLimiter, async (req, res) => {
  try {
    if (!metaviewConfigured()) {
      return res.status(503).json({ error: 'Auto sourcing unavailable — configure METAVIEW_OAUTH_TOKEN in .env' });
    }
    const doc = await HiringRequisition.findOne(notDeletedFilter({ _id: req.params.id }));
    if (!doc) return res.status(404).json({ error: 'Requisition not found' });
    if (!doc.brief?.trim() && !doc.role?.trim()) {
      return res.status(422).json({ error: 'Add a role title and job brief before launching Metaview' });
    }

    if (doc.metaviewSearchId) {
      const status = await getSearchStatus(doc.metaviewSearchId).catch(() => null);
      return     res.json({
      searchId: doc.metaviewSearchId,
      requisition: doc,
      alreadyActive: true,
      status,
      metaviewUrl: metaviewWebSearchUrl(doc.metaviewSearchId),
      message: 'Metaview search already active for this requisition. Use Sync to pull candidates.'
    });
  }

  const { searchId } = await startSearch(doc);
  if (!searchId) return res.status(502).json({ error: 'Metaview did not return search_id' });
  doc.metaviewSearchId = searchId;
  doc.sourcingMode = 'auto';
  if (doc.status === 'Draft') doc.status = 'Sourcing';
  await doc.save();
  await logHiringActivity({
    refType: 'requisition',
    refId: doc._id,
    action: 'metaview_search_started',
    detail: searchId,
    by: actorId(req)
  });
  res.json({
    searchId,
    requisition: doc,
    alreadyActive: false,
    metaviewUrl: metaviewWebSearchUrl(searchId),
    message: 'Metaview agent is sourcing candidates (typically 5–15 minutes). Sync periodically to import matches.'
  });
} catch (err) {
  res.status(502).json({ error: err.message });
}
});

router.post('/:id/sync', requireHiringWrite, metaviewSyncLimiter, async (req, res) => {
  try {
    const doc = await HiringRequisition.findOne(notDeletedFilter({ _id: req.params.id }));
    if (!doc) return res.status(404).json({ error: 'Requisition not found' });
    if (!doc.metaviewSearchId) {
      return res.status(422).json({ error: 'No metaviewSearchId on requisition' });
    }
    if (!metaviewConfigured()) {
      return res.status(503).json({ error: 'Metaview sync unavailable' });
    }
    const pulled = await pullCandidates(doc.metaviewSearchId);
    const createdBy = actorId(req);
    let upserted = 0;
    for (const row of pulled) {
      const existing = await HiringCandidate.findOne({
        requisitionId: doc._id,
        metaviewCandidateId: row.metaviewCandidateId,
        isDeleted: false
      });
      if (existing) {
        mergeMetaviewCandidate(existing, row);
        await existing.save();
      } else {
        await HiringCandidate.create({
          requisitionId: doc._id,
          entityTag: doc.entityTag,
          source: 'metaview',
          metaviewCandidateId: row.metaviewCandidateId,
          name: row.name,
          email: row.email,
          phone: row.phone,
          linkedinUrl: row.linkedinUrl,
          currentCompany: row.currentCompany,
          cityCurrent: row.cityCurrent,
          highlights: row.highlights,
          profileSnapshot: row.profileSnapshot || null,
          profileFetchedAt: row.profileSnapshot ? new Date() : null,
          createdBy: new mongoose.Types.ObjectId(createdBy)
        });
        upserted += 1;
      }
    }
    await logHiringActivity({
      refType: 'requisition',
      refId: doc._id,
      action: 'metaview_sync',
      detail: `${upserted} new candidates`,
      by: createdBy
    });
    const status = await getSearchStatus(doc.metaviewSearchId).catch(() => null);
    res.json({ upserted, total: pulled.length, status });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export { sourcingModeAvailable };
export default router;
