import { ensureMongo } from '../mongo.js';

const COUNTER_ID = 'hiring_req_code';

export async function nextReqCode() {
  const db = await ensureMongo();
  const counters = db.collection('hiring_counters');
  const result = await counters.findOneAndUpdate(
    { _id: COUNTER_ID },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  const seq = result?.seq ?? 1;
  return `GA-REQ-${String(seq).padStart(3, '0')}`;
}
