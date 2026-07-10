import mongoose from 'mongoose';
import HiringCandidate from '../../models/hiring/Candidate.js';
import { dedupeKey, mapRowByChannel } from './importParsers.js';
import { logHiringActivity } from './activity.js';

function slug(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function loadExistingDedupeKeys(requisitionId) {
  const existing = await HiringCandidate.find({
    requisitionId,
    isDeleted: false
  }).select('phone email name currentCompany').lean();

  const keys = new Set();
  for (const c of existing) {
    const k = dedupeKey(c);
    if (k) keys.add(k);
  }
  return keys;
}

export function mergeMetaviewCandidate(existing, row) {
  if (row.name && !existing.name) existing.name = row.name;
  if (row.highlights && !existing.highlights) existing.highlights = row.highlights;
  if (row.email && !existing.email) existing.email = row.email;
  if (row.phone && !existing.phone) existing.phone = row.phone;
  if (row.linkedinUrl && !existing.linkedinUrl) existing.linkedinUrl = row.linkedinUrl;
  if (row.currentCompany && !existing.currentCompany) existing.currentCompany = row.currentCompany;
  if (row.cityCurrent && !existing.cityCurrent) existing.cityCurrent = row.cityCurrent;
  if (row.profileSnapshot) {
    existing.profileSnapshot = row.profileSnapshot;
    existing.profileFetchedAt = new Date();
  }
  return existing;
}

export async function parseImportRows(rawRows, channel) {
  const mapped = [];
  const errors = [];
  rawRows.forEach((row, i) => {
    const rowIndex = i + 2;
    const result = mapRowByChannel(row, rowIndex, channel);
    if (result.error) errors.push(result.error);
    else mapped.push({ rowIndex, candidate: result.candidate });
  });
  return { mapped, errors };
}

export async function runCandidateImport({
  requisition,
  entityTag,
  channel,
  rawRows,
  createdBy,
  actorIdForLog
}) {
  const { mapped, errors } = await parseImportRows(rawRows, channel);
  if (errors.length) {
    return { imported: 0, skippedDuplicates: 0, errors, aborted: true };
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const existingKeys = await loadExistingDedupeKeys(requisition._id);
    const batchKeys = new Set();
    let imported = 0;
    let skippedDuplicates = 0;
    const dupErrors = [];

    for (const { rowIndex, candidate } of mapped) {
      const key = dedupeKey(candidate);
      if (key && (existingKeys.has(key) || batchKeys.has(key))) {
        skippedDuplicates += 1;
        dupErrors.push({ row: rowIndex, reason: 'Duplicate skipped', key });
        continue;
      }
      if (key) batchKeys.add(key);

      await HiringCandidate.create([{
        requisitionId: requisition._id,
        entityTag,
        source: candidate.source,
        name: candidate.name,
        phone: candidate.phone,
        email: candidate.email,
        linkedinUrl: candidate.linkedinUrl,
        currentCompany: candidate.currentCompany,
        currentCtcPaise: candidate.currentCtcPaise,
        expectedCtcPaise: candidate.expectedCtcPaise,
        noticePeriodDays: candidate.noticePeriodDays,
        cityCurrent: candidate.cityCurrent,
        highlights: candidate.highlights,
        agencyName: candidate.agencyName || '',
        agencyContact: candidate.agencyContact || '',
        agencyEmail: candidate.agencyEmail || '',
        agencyNotes: candidate.agencyNotes || '',
        currentStageNumber: 1,
        createdBy: new mongoose.Types.ObjectId(createdBy)
      }], { session });
      imported += 1;
    }

    await logHiringActivity({
      refType: 'requisition',
      refId: requisition._id,
      action: 'candidates_imported',
      detail: `${imported} imported, ${skippedDuplicates} duplicates skipped (${channel})`,
      by: actorIdForLog
    });

    await session.commitTransaction();
    return {
      imported,
      skippedDuplicates,
      errors: dupErrors,
      aborted: false
    };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export { slug };
