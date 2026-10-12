// End-to-end + RBAC test for the Hiring Tracker against a throwaway local database.
// Usage: node scripts/tracker-e2e.mjs   (requires local mongod on 127.0.0.1:27017)
process.env.MONGODB_URI = process.env.TRACKER_TEST_URI || 'mongodb://127.0.0.1:27017';
process.env.MONGODB_DB_NAME = 'ga_tracker_e2e_test';
process.env.DEV_BYPASS_AUTH = '0';
process.env.NODE_ENV = 'test';

const { default: express } = await import('express');
const { ObjectId } = await import('mongodb');
const { ensureMongo } = await import('../server/lib/mongo.js');
const { default: hiringRouter } = await import('../server/routes/hiring/index.js');
const { seedHiringTracker } = await import('../server/lib/hiring/tracker/seed.js');

const db = await ensureMongo();
if (db.databaseName !== 'ga_tracker_e2e_test') throw new Error('Refusing to run against a non-test database');
await db.dropDatabase();
await seedHiringTracker();

const users = {};
async function mkUser(key, name, roleIds, extra = {}) {
  const _id = new ObjectId();
  await db.collection('auth_users').insertOne({ _id, email: `${key}@test.local`, name, roleIds, status: 'active', ...extra });
  const sid = `sid-${key}-${_id}`;
  await db.collection('auth_sessions').insertOne({ _id: sid, userId: String(_id), expiresAt: new Date(Date.now() + 3600e3) });
  users[key] = { id: String(_id), name, cookie: `ga_auth_sid=${sid}` };
}
await db.collection('auth_roles').insertOne({ _id: 'viewer', name: 'Viewer', permissions: [], allowedApps: ['hiring'] });
await mkUser('outsider', 'Viewer Only', ['viewer']);
await mkUser('hr', 'Hema HR', ['hiring_hr']);
await mkUser('int1', 'Ivan Interviewer', ['hiring_interviewer']);
await mkUser('int2', 'Ira Interviewer', ['hiring_interviewer']);
await mkUser('dm', 'Dev Director', ['hiring_decision_maker']);

const app = express();
app.use(express.json());
app.use('/api/hiring', hiringRouter);
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}/api/hiring/tracker`;

async function call(who, method, path, body, raw) {
  const opts = { method, headers: { cookie: users[who].cookie } };
  if (raw) opts.body = raw;
  else if (body !== undefined) { opts.headers['content-type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(base + path, opts);
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* binary */ }
  return { status: r.status, json, text };
}

let passed = 0;
const failures = [];
function check(label, cond, extra) {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failures.push(label); console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`); }
}
const expectStatus = (label, res, code) => check(`${label} → ${code}`, res.status === code, `got ${res.status} ${res.json?.error || ''}`);
const fullAnswers = (ev, score = 4) => ev.answers.map((a) => ({ qid: a.qid, score: a.weight > 0 ? score : null, response: `resp ${a.qid}`, comment: `cmt ${a.qid}` }));

try {
  console.log('\nAccess gates');
  expectStatus('Viewer without tracker permission: /me', await call('outsider', 'GET', '/me'), 403);
  expectStatus('Viewer: /candidates', await call('outsider', 'GET', '/candidates'), 403);
  const meHr = await call('hr', 'GET', '/me');
  check('HR caps: hr=true mgmt=false decide=false', meHr.json?.caps?.hr && !meHr.json.caps.mgmt && !meHr.json.caps.decide);
  const meDm = await call('dm', 'GET', '/me');
  check('Decision-maker caps: mgmt + decide + override', meDm.json?.caps?.mgmt && meDm.json.caps.decide && meDm.json.caps.override);

  const { json: { positions } } = await call('hr', 'GET', '/positions');
  check('8 Golden HQ positions seeded', positions.length === 8, `got ${positions.length}`);
  const clm = positions.find((p) => p.code === 'GHQ-CLM');
  const tplHr = await call('hr', 'GET', `/templates?positionId=${clm._id}`);
  check('HR sees only the HR questionnaire', tplHr.json.templates.length === 1 && tplHr.json.templates[0].kind === 'HR');
  const tplDm = await call('dm', 'GET', `/templates?positionId=${clm._id}`);
  check('Decision-maker sees HR + R1 + R2 questionnaires', tplDm.json.templates.length === 3);
  expectStatus('HR cannot edit management questionnaire', await call('hr', 'PUT', `/templates/${clm._id}/MGMT_R1`, { questions: [{ text: 'x', weight: 1 }] }), 403);

  const ul = await call('hr', 'GET', '/users');
  check('Users list returns tracker users with roles', ul.json.users.length >= 4 && ul.json.users.some((u) => u.decide));

  console.log('\nCandidate creation');
  expectStatus('Missing phone and email', await call('hr', 'POST', '/candidates', { positionId: clm._id, name: 'No Contact' }), 422);
  const created = await call('hr', 'POST', '/candidates', { positionId: clm._id, name: 'Asha Kapoor', phone: '9800000001', email: 'asha@x.com', currentCompany: 'Lodha', totalExperienceYears: 6 });
  expectStatus('Create candidate A', created, 201);
  const A = created.json.candidate._id;
  const dup = await call('hr', 'POST', '/candidates', { positionId: clm._id, name: 'Asha K', phone: '9800000001' });
  check('Duplicate phone for same position → 409 with duplicateId', dup.status === 409 && dup.json.duplicateId === A);

  console.log('\nHR screening');
  const hrEv = await call('hr', 'GET', `/candidates/${A}/hr-eval`);
  check('HR questionnaire snapshotted (10 questions for Closing Manager)', hrEv.json.evaluation.answers.length === 10, `got ${hrEv.json.evaluation.answers.length}`);
  expectStatus('Advance before HR evaluation (non-override)', await call('hr', 'POST', `/candidates/${A}/transition`, { action: 'ADVANCE' }), 200);
  let cand = (await call('hr', 'GET', `/candidates/${A}`)).json.candidate;
  check('SHORTLISTED → HR_SCREENING via start', cand.stage === 'HR_SCREENING');
  expectStatus('Advance past HR without submitted screening', await call('hr', 'POST', `/candidates/${A}/transition`, { action: 'ADVANCE' }), 422);
  const partial = hrEv.json.evaluation.answers.slice(0, 3).map((a) => ({ qid: a.qid, score: 3 }));
  const draft = await call('hr', 'PUT', `/candidates/${A}/hr-eval`, { answers: partial, summary: 'draft' });
  check('Draft saves with partial scores', draft.status === 200 && draft.json.evaluation.status === 'DRAFT');
  expectStatus('Submit incomplete HR screening', await call('hr', 'PUT', `/candidates/${A}/hr-eval`, { submit: true, recommendation: 'RECOMMENDED' }), 422);
  // Weighted score check: alternate 5 and 3.
  const ans = hrEv.json.evaluation.answers.map((a, i) => ({ qid: a.qid, score: i % 2 ? 3 : 5, response: 'r', comment: 'c' }));
  const wSum = hrEv.json.evaluation.answers.reduce((s, a) => s + a.weight, 0);
  const expected = Math.round((hrEv.json.evaluation.answers.reduce((s, a, i) => s + a.weight * (i % 2 ? 3 : 5), 0) / wSum) * 100) / 100;
  const sub = await call('hr', 'PUT', `/candidates/${A}/hr-eval`, { answers: ans, recommendation: 'RECOMMENDED', summary: 'Strong closer', submit: true });
  check(`Weighted HR score = ${expected}`, Math.abs(sub.json?.evaluation?.score - expected) < 0.01, `got ${sub.json?.evaluation?.score}`);
  check('Recommended → auto-advance to 1st round', sub.json?.candidate?.stage === 'MGMT_R1');

  console.log('\nScheduling (HR coordinates)');
  const t1 = new Date(Date.now() + 2 * 864e5).toISOString();
  const t2 = new Date(Date.now() + 3 * 864e5).toISOString();
  let s = await call('hr', 'PATCH', `/candidates/${A}/schedule`, { round: '1', scheduledAt: t1, interviewerId: users.int1.id, interviewerName: users.int1.name, mode: 'IN_PERSON' });
  check('HR schedules 1st round with interviewer', s.status === 200 && s.json.candidate.r1.status === 'SCHEDULED');
  s = await call('hr', 'PATCH', `/candidates/${A}/schedule`, { round: '1', scheduledAt: t2 });
  check('Reschedule increments rescheduleCount', s.json.candidate.r1.rescheduleCount === 1);
  expectStatus('HR cannot hold/reject at management stage', await call('hr', 'POST', `/candidates/${A}/transition`, { action: 'REJECT', reasonCode: 'EXPERIENCE_GAP' }), 403);

  console.log('\nManagement 1st round — confidentiality');
  expectStatus('HR GET management evaluation', await call('hr', 'GET', `/mgmt/candidates/${A}/eval/1`), 403);
  expectStatus('HR PUT management evaluation', await call('hr', 'PUT', `/mgmt/candidates/${A}/eval/1`, { summary: 'x' }), 403);
  expectStatus('HR GET management summary', await call('hr', 'GET', `/mgmt/candidates/${A}/summary`), 403);
  expectStatus('HR toggle 2nd round', await call('hr', 'POST', `/mgmt/candidates/${A}/second-round`, { required: true }), 403);
  const r1 = await call('int1', 'GET', `/mgmt/candidates/${A}/eval/1`);
  check('Interviewer loads R1 questionnaire (8 questions)', r1.json?.evaluation?.answers?.length === 8);
  expectStatus('Unassigned interviewer cannot edit R1', await call('int2', 'PUT', `/mgmt/candidates/${A}/eval/1`, { summary: 'x' }), 403);
  expectStatus('Submit incomplete R1', await call('int1', 'PUT', `/mgmt/candidates/${A}/eval/1`, { submit: true, recommendation: 'RECOMMENDED' }), 422);
  const SECRET = 'CONFIDENTIAL-MGMT-REMARK-7731';
  const r1ans = r1.json.evaluation.answers.map((a) => ({ qid: a.qid, score: 4, response: `${SECRET} response`, comment: `${SECRET} comment` }));
  const r1sub = await call('int1', 'PUT', `/mgmt/candidates/${A}/eval/1`, {
    answers: r1ans, recommendation: 'RECOMMENDED', strengths: `${SECRET} strengths`, concerns: `${SECRET} concerns`,
    summary: `${SECRET} summary`, requiresSecondRound: true, submit: true
  });
  check('R1 submitted, needs 2nd round → MGMT_R2', r1sub.json?.candidate?.stage === 'MGMT_R2' && r1sub.json.candidate.r2Required);

  const hrView = await call('hr', 'GET', `/candidates/${A}`);
  const hrList = await call('hr', 'GET', '/candidates?status=');
  const hrDash = await call('hr', 'GET', '/dashboard');
  const hrHrEval = await call('hr', 'GET', `/candidates/${A}/hr-eval`);
  const leak = [hrView, hrList, hrDash, hrHrEval].some((r) => r.text.includes(SECRET));
  check('No management content in any HR-reachable response', !leak);
  check('HR candidate view has no management score fields', !hrView.text.includes('mgmtEval') && hrView.json.candidate.r1EvalStatus === 'SUBMITTED');
  check('HR list carries no management scores', hrList.json.candidates.every((c) => !c.mgmtEval));
  check('HR dashboard omits management averages + overrides', hrDash.json.scores.r1Avg === undefined && hrDash.json.kpis.overrides === undefined);
  const hist = hrView.json.candidate.history;
  check('History shows R1 operational entry without score', hist.some((h) => /1st round evaluation submitted/.test(h.summary)) && !hist.some((h) => /\d\.\d+\/5/.test(h.summary) && /1st round/.test(h.summary)));
  const dmList = await call('dm', 'GET', '/candidates?status=');
  check('Decision-maker list includes R1 score', dmList.json.candidates.find((c) => c._id === A)?.mgmtEval?.r1?.score === 4);
  expectStatus('Locked: R1 edit after candidate moved on (interviewer)', await call('int1', 'PUT', `/mgmt/candidates/${A}/eval/1`, { summary: 'late edit' }), 409);

  console.log('\n2nd round + decision');
  expectStatus('HR schedules 2nd round', await call('hr', 'PATCH', `/candidates/${A}/schedule`, { round: '2', scheduledAt: t2, interviewerId: users.dm.id, interviewerName: users.dm.name }), 200);
  const r2 = await call('dm', 'GET', `/mgmt/candidates/${A}/eval/2`);
  const r2sub = await call('dm', 'PUT', `/mgmt/candidates/${A}/eval/2`, { answers: fullAnswers(r2.json.evaluation, 5), recommendation: 'RECOMMENDED', summary: 'Hire', submit: true });
  check('R2 submitted → DECISION', r2sub.json?.candidate?.stage === 'DECISION');
  expectStatus('HR cannot record final decision', await call('hr', 'POST', `/candidates/${A}/decision`, { outcome: 'SELECTED', remarks: 'x' }), 403);
  expectStatus('Interviewer (no DECIDE) cannot record decision', await call('int1', 'POST', `/candidates/${A}/decision`, { outcome: 'SELECTED', remarks: 'x' }), 403);
  expectStatus('Decision without remarks', await call('dm', 'POST', `/candidates/${A}/decision`, { outcome: 'SELECTED' }), 422);
  const dec = await call('dm', 'POST', `/candidates/${A}/decision`, { outcome: 'SELECTED', remarks: `${SECRET} decision remarks` });
  check('Decision-maker selects candidate', dec.json?.candidate?.status === 'SELECTED');
  const hrAfter = await call('hr', 'GET', `/candidates/${A}`);
  check('HR sees outcome SELECTED but not decision remarks', hrAfter.json.candidate.decision.outcome === 'SELECTED' && !hrAfter.text.includes(SECRET));
  const wd = await call('hr', 'POST', `/candidates/${A}/transition`, { action: 'WITHDRAW', reasonCode: 'OFFER_DECLINED' });
  check('HR records offer declined after selection (withdraw)', wd.status === 200 && wd.json.candidate.status === 'WITHDRAWN', `${wd.status} ${wd.json?.error || ''}`);

  console.log('\nReject / hold / resume / no-show / override');
  const B = (await call('hr', 'POST', '/candidates', { positionId: clm._id, name: 'Bala R', phone: '9800000002' })).json.candidate._id;
  expectStatus('Reject without reason code', await call('hr', 'POST', `/candidates/${B}/transition`, { action: 'REJECT' }), 422);
  expectStatus('HR puts B on hold (HR stage)', await call('hr', 'POST', `/candidates/${B}/transition`, { action: 'HOLD', reasonCode: 'OTHER', reason: 'Travelling' }), 200);
  expectStatus('HR evaluation blocked while on hold', await call('hr', 'PUT', `/candidates/${B}/hr-eval`, { summary: 'x' }), 409);
  expectStatus('HR resumes B', await call('hr', 'POST', `/candidates/${B}/transition`, { action: 'RESUME' }), 200);
  const rej = await call('hr', 'POST', `/candidates/${B}/transition`, { action: 'REJECT', reasonCode: 'EXPERIENCE_GAP', reason: 'No luxury exposure' });
  check('HR rejects B at screening', rej.json?.candidate?.status === 'REJECTED');
  expectStatus('Cannot hold an already-rejected candidate', await call('hr', 'POST', `/candidates/${B}/transition`, { action: 'HOLD', reasonCode: 'OTHER', reason: 'x' }), 409);
  expectStatus('HR cannot reopen', await call('hr', 'POST', `/candidates/${B}/transition`, { action: 'REOPEN', reason: 'x' }), 403);
  expectStatus('Decision-maker reopens with reason', await call('dm', 'POST', `/candidates/${B}/transition`, { action: 'REOPEN', reason: 'Re-evaluate' }), 200);

  const C = (await call('hr', 'POST', '/candidates', { positionId: clm._id, name: 'Chetan M', email: 'chetan@x.com' })).json.candidate._id;
  expectStatus('HR override attempt (no permission)', await call('hr', 'POST', `/candidates/${C}/transition`, { action: 'MOVE', to: 'MGMT_R1', reason: 'x' }), 403);
  await call('hr', 'POST', `/candidates/${C}/transition`, { action: 'START_HR' });
  const gate = await call('dm', 'POST', `/candidates/${C}/transition`, { action: 'ADVANCE' });
  check('Gate blocks advance without HR screening (overridable flag returned)', gate.status === 422 && gate.json.overridable === true);
  expectStatus('Override without reason', await call('dm', 'POST', `/candidates/${C}/transition`, { action: 'ADVANCE', override: true }), 422);
  const ov = await call('dm', 'POST', `/candidates/${C}/transition`, { action: 'ADVANCE', override: true, reason: 'Referred by MD; fast-track' });
  check('Authorised override advances + audited', ov.json?.candidate?.stage === 'MGMT_R1' && ov.json.candidate.overrideCount === 1 && ov.json.candidate.history.some((h) => h.override));
  await call('hr', 'PATCH', `/candidates/${C}/schedule`, { round: '1', scheduledAt: t1 });
  await call('hr', 'PATCH', `/candidates/${C}/schedule`, { round: '1', status: 'NO_SHOW' });
  const ns = await call('hr', 'PATCH', `/candidates/${C}/schedule`, { round: '1', status: 'NO_SHOW' });
  check('Two no-shows counted, next action suggests rejection', ns.json.candidate.r1.noShowCount === 2 && /consider rejecting/.test(ns.json.candidate.nextAction));
  const hrC = await call('hr', 'GET', `/candidates/${C}`);
  check('Override reason hidden from HR', !hrC.text.includes('Referred by MD'));

  console.log('\nHR "Hold" recommendation → management pull-through');
  const D = (await call('hr', 'POST', '/candidates', { positionId: clm._id, name: 'Divya S', phone: '9800000004' })).json.candidate._id;
  const dEv = await call('hr', 'GET', `/candidates/${D}/hr-eval`);
  const dSub = await call('hr', 'PUT', `/candidates/${D}/hr-eval`, { answers: fullAnswers(dEv.json.evaluation, 3), recommendation: 'HOLD', submit: true });
  check('HR Hold keeps candidate at HR screening', dSub.json?.candidate?.stage === 'HR_SCREENING');
  expectStatus('HR cannot advance an HR-hold candidate', await call('hr', 'POST', `/candidates/${D}/transition`, { action: 'ADVANCE' }), 422);
  expectStatus('Management pulls through without reason', await call('int1', 'POST', `/candidates/${D}/transition`, { action: 'ADVANCE' }), 422);
  const pull = await call('int1', 'POST', `/candidates/${D}/transition`, { action: 'ADVANCE', reason: 'Worth meeting' });
  check('Management pulls HR-hold candidate into 1st round', pull.json?.candidate?.stage === 'MGMT_R1');
  const r1D = await call('int1', 'GET', `/mgmt/candidates/${D}/eval/1`);
  const r1Dsub = await call('int1', 'PUT', `/mgmt/candidates/${D}/eval/1`, { answers: fullAnswers(r1D.json.evaluation, 2), recommendation: 'NOT_RECOMMENDED', submit: true });
  check('R1 without 2nd round → straight to DECISION (R2 optional)', r1Dsub.json?.candidate?.stage === 'DECISION' && !r1Dsub.json.candidate.r2Required);

  console.log('\nResume upload');
  const pdf = new FormData();
  pdf.append('file', new Blob([Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')], { type: 'application/pdf' }), 'asha cv.pdf');
  const up = await call('hr', 'POST', `/candidates/${D}/resume`, undefined, pdf);
  check('Valid PDF resume accepted', up.status === 200 && up.json.candidate.resume?.name?.endsWith('.pdf'), `${up.status} ${up.json?.error || ''}`);
  const fake = new FormData();
  fake.append('file', new Blob([Buffer.from('<script>alert(1)</script>')], { type: 'application/pdf' }), 'evil.pdf');
  expectStatus('Non-PDF content renamed .pdf rejected', await call('hr', 'POST', `/candidates/${D}/resume`, undefined, fake), 422);
  const dl = await fetch(`${base}/candidates/${D}/resume`, { headers: { cookie: users.hr.cookie } });
  check('Resume served inline with nosniff', dl.status === 200 && dl.headers.get('x-content-type-options') === 'nosniff' && dl.headers.get('content-type') === 'application/pdf');

  console.log('\nDashboard + buckets');
  const dash = await call('dm', 'GET', '/dashboard');
  const k = dash.json.kpis;
  check(`KPIs total=4 hrDone=2 r1Done=2 r2Done=1`, k.total === 4 && k.hrDone === 2 && k.r1Done === 2 && k.r2Done === 1, JSON.stringify(k));
  check('Management dashboard has R1/R2 averages + override count', dash.json.scores.r1Avg === 3 && dash.json.scores.r2Avg === 5 && k.overrides >= 2, JSON.stringify(dash.json.scores));
  check('Funnel has 6 steps starting at total', dash.json.funnel.length === 6 && dash.json.funnel[0].count === 4);
  const aw = await call('dm', 'GET', '/candidates?bucket=awaiting_decision');
  check('Awaiting-decision bucket drill-down returns Divya', aw.json.candidates.length === 1 && aw.json.candidates[0]._id === D);
  const byInt = await call('dm', 'GET', `/candidates?interviewer=${users.int1.id}`);
  check('Interviewer filter returns candidates assigned to int1', byInt.json.candidates.some((c) => c._id === A));

  console.log('\nQuestionnaire editing (no code changes)');
  const edit = await call('dm', 'PUT', `/templates/${clm._id}/HR`, { questions: [{ text: 'Walk me through your best close', category: 'Sales', weight: 5 }, { text: 'Notes only', weight: 0 }] });
  check('Decision-maker edits HR questionnaire (version bump)', edit.status === 200 && edit.json.template.version >= 2 && edit.json.template.questions.length === 2);
  const E = (await call('hr', 'POST', '/candidates', { positionId: clm._id, name: 'Esha T', phone: '9800000005' })).json.candidate._id;
  const eEv = await call('hr', 'GET', `/candidates/${E}/hr-eval`);
  check('New candidate gets the edited questionnaire', eEv.json.evaluation.answers.length === 2);
  const aEv = await call('hr', 'GET', `/candidates/${A}/hr-eval`);
  check('Existing evaluation keeps its snapshotted questions', aEv.json.evaluation.answers.length === 10);
  const eSub = await call('hr', 'PUT', `/candidates/${E}/hr-eval`, { answers: [{ qid: eEv.json.evaluation.answers[0].qid, score: 4 }], recommendation: 'NOT_RECOMMENDED', submit: true });
  check('Weight-0 question not required for submit', eSub.status === 200 && eSub.json.evaluation.score === 4, `${eSub.status} ${eSub.json?.error || ''}`);
  const reset = await call('dm', 'POST', `/templates/${clm._id}/HR/reset`);
  check('Reset restores default HR questions', reset.json?.template?.questions?.length === 10);

  console.log('\nProfile PATCH allow-list');
  const patch = await call('hr', 'PATCH', `/candidates/${E}`, { currentCompany: 'Godrej', stage: 'DECISION', status: 'SELECTED', overrideCount: 0 });
  check('PATCH ignores stage/status fields', patch.json.candidate.stage !== 'DECISION' && patch.json.candidate.status === 'ACTIVE' && patch.json.candidate.currentCompany === 'Godrej');
  expectStatus('HR cannot delete candidates', await call('hr', 'DELETE', `/candidates/${E}`), 403);
} catch (e) {
  failures.push(`CRASH: ${e.stack || e.message}`);
  console.error(e);
} finally {
  server.close();
  await db.dropDatabase();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) console.log(failures.map((f) => ` - ${f}`).join('\n'));
  process.exit(failures.length ? 1 : 0);
}
