import { ensureMongo } from '../../mongo.js';
import { ensureHiringMongoose } from '../mongoose.js';
import { TrkPosition, TrkTemplate, TrkCandidate, TrkHrEval, TrkMgmtEval } from '../../../models/hiring/Tracker.js';
import {
  DEFAULT_POSITIONS, DEFAULT_R2_QUESTIONS, GENERIC_HR_QUESTIONS, GENERIC_MGMT_QUESTIONS
} from './questionBank.js';
import { TRACKER_PERMS } from './access.js';

export function defaultQuestions(positionCode, kind) {
  const p = DEFAULT_POSITIONS.find((x) => x.code === positionCode);
  if (kind === 'HR') return p?.hr || GENERIC_HR_QUESTIONS;
  if (kind === 'MGMT_R1') return p?.mgmt || GENERIC_MGMT_QUESTIONS;
  return DEFAULT_R2_QUESTIONS;
}

export async function ensureTemplatesForPosition(position) {
  for (const kind of ['HR', 'MGMT_R1', 'MGMT_R2']) {
    await TrkTemplate.updateOne(
      { positionId: position._id, kind },
      { $setOnInsert: { positionId: position._id, kind, questions: defaultQuestions(position.code, kind), version: 1 } },
      { upsert: true }
    );
  }
}

async function seedRoles() {
  const db = await ensureMongo();
  if (!db) return;
  const roles = [
    {
      _id: 'hiring_hr',
      name: 'Hiring — HR',
      description: 'Hiring Tracker: candidate management and HR screening. No access to management interview content.',
      permissions: [TRACKER_PERMS.HR]
    },
    {
      _id: 'hiring_interviewer',
      name: 'Hiring — Management Interviewer',
      description: 'Hiring Tracker: conduct and view management interview rounds.',
      permissions: [TRACKER_PERMS.HR, TRACKER_PERMS.MGMT]
    },
    {
      _id: 'hiring_decision_maker',
      name: 'Hiring — Decision Maker',
      description: 'Hiring Tracker: management rounds, final hiring decision and authorised stage overrides.',
      permissions: [TRACKER_PERMS.HR, TRACKER_PERMS.MGMT, TRACKER_PERMS.DECIDE]
    }
  ];
  for (const r of roles) {
    await db.collection('auth_roles').updateOne(
      { _id: r._id },
      { $setOnInsert: { ...r, allowedApps: ['hiring'], allowedProjects: [], allowedTabs: [] } },
      { upsert: true }
    );
  }
  // Existing Hiring Managers run recruitment day-to-day: HR level only, never management content.
  await db.collection('auth_roles').updateOne(
    { _id: 'hiring_manager', trackerSeeded: { $ne: true } },
    { $addToSet: { permissions: TRACKER_PERMS.HR }, $set: { trackerSeeded: true } }
  );
}

export async function seedHiringTracker() {
  try {
    await ensureHiringMongoose();
    for (let i = 0; i < DEFAULT_POSITIONS.length; i += 1) {
      const { hr, mgmt, ...pos } = DEFAULT_POSITIONS[i];
      await TrkPosition.updateOne(
        { code: pos.code },
        { $setOnInsert: { ...pos, openings: 1, isActive: true, sortOrder: i + 1 } },
        { upsert: true }
      );
    }
    const positions = await TrkPosition.find({}).lean();
    for (const p of positions) await ensureTemplatesForPosition(p);
    await seedRoles();
    await Promise.all([
      TrkPosition.syncIndexes(), TrkTemplate.syncIndexes(), TrkCandidate.syncIndexes(),
      TrkHrEval.syncIndexes(), TrkMgmtEval.syncIndexes()
    ]);
  } catch (err) {
    console.warn('[Hiring Tracker] seed skipped:', err.message);
  }
}
