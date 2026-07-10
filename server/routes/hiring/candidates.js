import { Router } from 'express';
import mongoose from 'mongoose';
import HiringCandidate from '../../models/hiring/Candidate.js';
import HiringRequisition from '../../models/hiring/Requisition.js';
import HiringInterview from '../../models/hiring/Interview.js';
import HiringOffer from '../../models/hiring/Offer.js';
import { attachHiringUser, actorId, logHiringActivity } from '../../lib/hiring/activity.js';
import { requireHiringWrite } from '../../lib/hiring/access.js';
import {
  requireEntityTag, requireEntityTagParam, assertPaise, assertNoticePeriodDays, notDeletedFilter
} from '../../lib/hiring/validate.js';
import { validateBody } from '../../lib/hiring/validateBody.js';
import { isValidStageTransition, stageLabel } from '../../lib/hiring/stages.js';
import { pushStageHistory } from '../../lib/hiring/stageHistory.js';
import { maybeAutoFulfillRequisition } from '../../lib/hiring/fulfillment.js';
import { pushFeedback, fetchCandidateProfile, metaviewConfigured } from '../../lib/hiring/metaviewService.js';
import { CANDIDATE_SOURCES } from '../../lib/hiring/constants.js';
import { parseSpreadsheetBuffer } from '../../lib/hiring/importParsers.js';
import { runCandidateImport, parseImportRows } from '../../lib/hiring/importService.js';
import { importUpload } from '../../lib/hiring/importUpload.js';
import { hiringImportLimiter } from '../../lib/hiring/rateLimit.js';

const router = Router();
const IMPORT_CHANNELS = ['naukri', 'linkedin', 'agency', 'apna', 'other'];

router.use(attachHiringUser);

const PROFILE_CACHE_MS = 6 * 60 * 60 * 1000;

async function enrichCandidateProfile(candidate, requisition) {
  if (!candidate.metaviewCandidateId || !requisition?.metaviewSearchId || !metaviewConfigured()) {
    return candidate.profileSnapshot || null;
  }
  const stale = !candidate.profileFetchedAt
    || Date.now() - new Date(candidate.profileFetchedAt).getTime() > PROFILE_CACHE_MS;
  if (candidate.profileSnapshot && !stale) {
    return candidate.profileSnapshot;
  }
  try {
    const profile = await fetchCandidateProfile(requisition.metaviewSearchId, candidate.metaviewCandidateId);
    if (profile) {
      candidate.profileSnapshot = profile;
      candidate.profileFetchedAt = new Date();
      if (profile.linkedinUrl && !candidate.linkedinUrl) candidate.linkedinUrl = profile.linkedinUrl;
      if (profile.location && !candidate.cityCurrent) candidate.cityCurrent = profile.location;
      if (profile.experience?.[0]?.company && !candidate.currentCompany) {
        candidate.currentCompany = profile.experience[0].company;
      }
      if (profile.emails?.[0] && !candidate.email) candidate.email = profile.emails[0];
      if (profile.phones?.[0] && !candidate.phone) candidate.phone = profile.phones[0];
      if (!candidate.highlights && profile.summary?.length) {
        candidate.highlights = profile.summary.map((s) => s.description).join('\n');
      }
      await candidate.save();
    }
    return profile;
  } catch {
    return candidate.profileSnapshot || null;
  }
}

async function loadRequisition(requisitionId, res) {
  const requisition = await HiringRequisition.findOne(notDeletedFilter({ _id: requisitionId }));
  if (!requisition) {
    res.status(404).json({ error: 'Requisition not found' });
    return null;
  }
  return requisition;
}

function resolveImportChannel(req) {
  return String(req.body?.channel || req.query?.channel || 'naukri').toLowerCase();
}

router.get('/', async (req, res) => {
  try {
    const filter = notDeletedFilter();
    if (req.query.requisitionId) filter.requisitionId = req.query.requisitionId;
    if (req.query.stage) filter.currentStageNumber = Number(req.query.stage);
    if (req.query.entityTag) filter.entityTag = req.query.entityTag;
    const candidates = await HiringCandidate.find(filter).sort({ updatedAt: -1 }).lean();
    res.json({ candidates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/import/preview', requireHiringWrite, hiringImportLimiter, importUpload.single('file'), async (req, res) => {
  try {
    const requisitionId = req.body.requisitionId;
    const entityTag = requireEntityTagParam(req.body.entityTag, res);
    if (!entityTag) return;
    const channel = resolveImportChannel(req);
    if (!IMPORT_CHANNELS.includes(channel)) {
      return res.status(422).json({ error: 'Invalid channel', allowed: IMPORT_CHANNELS });
    }
    const requisition = await loadRequisition(requisitionId, res);
    if (!requisition) return;
    if (!req.file?.buffer?.length) {
      return res.status(422).json({ error: 'CSV or XLSX file required (max 5 MB)' });
    }
    const rawRows = await parseSpreadsheetBuffer(req.file.buffer, req.file.originalname);
    const { mapped, errors } = await parseImportRows(rawRows, channel);
    res.json({
      requisitionId: requisition._id,
      entityTag,
      channel,
      totalRows: rawRows.length,
      preview: mapped.slice(0, 5).map(({ rowIndex, candidate }) => ({ row: rowIndex, ...candidate })),
      errors
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/import', requireHiringWrite, hiringImportLimiter, importUpload.single('file'), async (req, res) => {
  try {
    const requisitionId = req.body.requisitionId;
    const entityTag = requireEntityTagParam(req.body.entityTag, res);
    if (!entityTag) return;
    const channel = resolveImportChannel(req);
    if (!IMPORT_CHANNELS.includes(channel)) {
      return res.status(422).json({ error: 'Invalid channel', allowed: IMPORT_CHANNELS });
    }
    const requisition = await loadRequisition(requisitionId, res);
    if (!requisition) return;
    if (!req.file?.buffer?.length) {
      return res.status(422).json({ error: 'CSV or XLSX file required (max 5 MB)' });
    }
    const rawRows = await parseSpreadsheetBuffer(req.file.buffer, req.file.originalname);
    const createdBy = actorId(req);
    const result = await runCandidateImport({
      requisition,
      entityTag,
      channel,
      rawRows,
      createdBy,
      actorIdForLog: createdBy
    });
    if (result.aborted) {
      return res.status(422).json({
        imported: 0,
        skippedDuplicates: 0,
        errors: result.errors,
        aborted: true
      });
    }
    res.json({
      imported: result.imported,
      skippedDuplicates: result.skippedDuplicates,
      errors: result.errors
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const candidateDoc = await HiringCandidate.findOne(notDeletedFilter({ _id: req.params.id }));
    if (!candidateDoc) return res.status(404).json({ error: 'Candidate not found' });
    const requisition = await HiringRequisition.findById(candidateDoc.requisitionId).lean();
    const profile = await enrichCandidateProfile(candidateDoc, requisition);
    const candidate = candidateDoc.toObject();
    const [interviews, offer] = await Promise.all([
      HiringInterview.find(notDeletedFilter({ candidateId: candidate._id })).sort({ round: 1 }).lean(),
      HiringOffer.findOne(notDeletedFilter({ candidateId: candidate._id })).lean()
    ]);
    res.json({ candidate, requisition, interviews, offer, profile: profile || candidate.profileSnapshot || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/refresh-profile', requireHiringWrite, async (req, res) => {
  try {
    const candidateDoc = await HiringCandidate.findOne(notDeletedFilter({ _id: req.params.id }));
    if (!candidateDoc) return res.status(404).json({ error: 'Candidate not found' });
    if (!candidateDoc.metaviewCandidateId) {
      return res.status(422).json({ error: 'No Metaview profile linked to this candidate' });
    }
    const requisition = await HiringRequisition.findById(candidateDoc.requisitionId).lean();
    if (!requisition?.metaviewSearchId) {
      return res.status(422).json({ error: 'Requisition has no Metaview search' });
    }
    candidateDoc.profileFetchedAt = null;
    const profile = await enrichCandidateProfile(candidateDoc, requisition);
    res.json({ candidate: candidateDoc.toObject(), profile });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

router.post('/', requireHiringWrite, validateBody([
  'requisitionId', 'entityTag', 'source', 'name', 'phone', 'email', 'linkedinUrl',
  'currentCompany', 'currentCtcPaise', 'expectedCtcPaise', 'noticePeriodDays',
  'cityCurrent', 'highlights', 'metaviewCandidateId',
  'agencyName', 'agencyContact', 'agencyEmail', 'agencyNotes'
]), async (req, res) => {
  try {
    const requisition = await HiringRequisition.findOne(notDeletedFilter({ _id: req.body.requisitionId }));
    if (!requisition) return res.status(404).json({ error: 'Requisition not found' });
    const entityTag = requireEntityTag(req.body, res);
    if (!entityTag) return;
    const source = req.body.source || 'other';
    if (!CANDIDATE_SOURCES.includes(source)) {
      return res.status(422).json({ error: 'Invalid source', allowed: CANDIDATE_SOURCES });
    }
    const agencyName = String(req.body.agencyName || '').trim();
    if (source === 'agency' && !agencyName) {
      return res.status(422).json({ error: 'agencyName is required when source is agency' });
    }
    const createdBy = actorId(req);
    const doc = await HiringCandidate.create({
      requisitionId: requisition._id,
      entityTag,
      source,
      name: req.body.name,
      phone: req.body.phone,
      email: req.body.email,
      linkedinUrl: req.body.linkedinUrl,
      currentCompany: req.body.currentCompany,
      currentCtcPaise: assertPaise(req.body.currentCtcPaise, 'currentCtcPaise'),
      expectedCtcPaise: assertPaise(req.body.expectedCtcPaise, 'expectedCtcPaise'),
      noticePeriodDays: assertNoticePeriodDays(req.body.noticePeriodDays),
      cityCurrent: req.body.cityCurrent,
      highlights: req.body.highlights,
      metaviewCandidateId: req.body.metaviewCandidateId || null,
      agencyName: agencyName || '',
      agencyContact: String(req.body.agencyContact || '').trim(),
      agencyEmail: String(req.body.agencyEmail || '').trim(),
      agencyNotes: String(req.body.agencyNotes || '').trim(),
      createdBy: new mongoose.Types.ObjectId(createdBy)
    });

    if (source === 'agency' && agencyName) {
      const already = (requisition.agenciesShared || []).some(
        (a) => String(a.name || '').toLowerCase() === agencyName.toLowerCase()
      );
      if (!already) {
        requisition.agenciesShared = requisition.agenciesShared || [];
        requisition.agenciesShared.push({
          name: agencyName,
          contact: String(req.body.agencyContact || '').trim(),
          sharedAt: new Date(),
          notes: 'Auto-added from candidate submission'
        });
        await requisition.save();
      }
    }

    await logHiringActivity({
      refType: 'candidate',
      refId: doc._id,
      action: 'created',
      detail: source === 'agency'
        ? `agency:${agencyName} · stage ${doc.currentStageNumber}`
        : `stage ${doc.currentStageNumber}`,
      by: createdBy
    });
    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', requireHiringWrite, validateBody([
  'name', 'phone', 'email', 'linkedinUrl', 'currentCompany', 'noticePeriodDays',
  'cityCurrent', 'highlights', 'resumeDriveFileId', 'currentCtcPaise', 'expectedCtcPaise',
  'source', 'agencyName', 'agencyContact', 'agencyEmail', 'agencyNotes'
]), async (req, res) => {
  try {
    const doc = await HiringCandidate.findOne(notDeletedFilter({ _id: req.params.id }));
    if (!doc) return res.status(404).json({ error: 'Candidate not found' });
    const fields = [
      'name', 'phone', 'email', 'linkedinUrl', 'currentCompany', 'cityCurrent',
      'highlights', 'resumeDriveFileId', 'agencyName', 'agencyContact', 'agencyEmail', 'agencyNotes'
    ];
    for (const key of fields) {
      if (req.body[key] !== undefined) doc[key] = req.body[key];
    }
    if (req.body.source !== undefined) {
      if (!CANDIDATE_SOURCES.includes(req.body.source)) {
        return res.status(422).json({ error: 'Invalid source', allowed: CANDIDATE_SOURCES });
      }
      doc.source = req.body.source;
    }
    if (doc.source === 'agency' && !String(doc.agencyName || '').trim()) {
      return res.status(422).json({ error: 'agencyName is required when source is agency' });
    }
    if (req.body.currentCtcPaise !== undefined) doc.currentCtcPaise = assertPaise(req.body.currentCtcPaise, 'currentCtcPaise');
    if (req.body.expectedCtcPaise !== undefined) doc.expectedCtcPaise = assertPaise(req.body.expectedCtcPaise, 'expectedCtcPaise');
    if (req.body.noticePeriodDays !== undefined) doc.noticePeriodDays = assertNoticePeriodDays(req.body.noticePeriodDays);
    await doc.save();
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id/stage', requireHiringWrite, validateBody(['toStage', 'note']), async (req, res) => {
  try {
    const toStage = Number(req.body.toStage);
    const doc = await HiringCandidate.findOne(notDeletedFilter({ _id: req.params.id }));
    if (!doc) return res.status(404).json({ error: 'Candidate not found' });
    if (!isValidStageTransition(doc.currentStageNumber, toStage)) {
      return res.status(422).json({
        error: 'Invalid stage transition',
        from: doc.currentStageNumber,
        to: toStage
      });
    }
    const from = doc.currentStageNumber;
    doc.currentStageNumber = toStage;
    doc.stageEnteredAt = new Date();
    pushStageHistory(doc, toStage, actorId(req));
    await doc.save();
    await logHiringActivity({
      refType: 'candidate',
      refId: doc._id,
      action: 'stage_change',
      detail: `${from} → ${toStage} (${stageLabel(toStage)})`,
      by: actorId(req)
    });
    if (toStage === 7) {
      await maybeAutoFulfillRequisition(doc.requisitionId, actorId(req));
    }
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/feedback', requireHiringWrite, validateBody(['verdict', 'note']), async (req, res) => {
  try {
    const { verdict, note } = req.body;
    if (!['YES', 'NO', 'MAYBE'].includes(verdict)) {
      return res.status(422).json({ error: 'verdict must be YES, NO, or MAYBE' });
    }
    const doc = await HiringCandidate.findOne(notDeletedFilter({ _id: req.params.id }));
    if (!doc) return res.status(404).json({ error: 'Candidate not found' });
    const by = actorId(req);
    const entry = {
      verdict,
      note: note || '',
      by: by ? new mongoose.Types.ObjectId(by) : null,
      at: new Date(),
      syncedToMetaview: false
    };
    doc.feedbackHistory.push(entry);
    let synced = false;
    if (doc.metaviewCandidateId && metaviewConfigured()) {
      const reqDoc = await HiringRequisition.findById(doc.requisitionId).lean();
      if (reqDoc?.metaviewSearchId) {
        try {
          await pushFeedback(reqDoc.metaviewSearchId, doc.metaviewCandidateId, verdict, note);
          entry.syncedToMetaview = true;
          synced = true;
        } catch {
          entry.syncedToMetaview = false;
        }
      }
    }
    await doc.save();
    await logHiringActivity({
      refType: 'candidate',
      refId: doc._id,
      action: 'feedback',
      detail: verdict,
      by
    });
    res.json({ candidate: doc, syncedToMetaview: synced });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', requireHiringWrite, async (req, res) => {
  try {
    const doc = await HiringCandidate.findOne(notDeletedFilter({ _id: req.params.id }));
    if (!doc) return res.status(404).json({ error: 'Candidate not found' });
    doc.isDeleted = true;
    doc.deletedAt = new Date();
    await doc.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
