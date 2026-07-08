import mongoose from 'mongoose';

export function pushStageHistory(doc, stage, by) {
  if (!doc.stageHistory) doc.stageHistory = [];
  doc.stageHistory.push({
    stage,
    at: new Date(),
    by: by ? new mongoose.Types.ObjectId(by) : null
  });
}
