import PipelineStep from '../../models/postsales/PipelineStep.js';
import { hydrateStepTaskKinds } from './helpers.js';

export function isVersionError(err) {
  return err?.name === 'VersionError' || /No matching document found for id/i.test(String(err?.message || ''));
}

/** Save with retry when checklist/comments race (My Tasks modal). */
export async function mutatePipelineStep(unitId, stepNumber, mutateFn, { maxAttempts = 4 } = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const step = await PipelineStep.findOne({ unitId, stepNumber });
    if (!step) {
      const err = new Error('Step not found');
      err.status = 404;
      throw err;
    }
    await mutateFn(step);
    if (step.isModified?.('checklist')) step.markModified('checklist');
    if (step.isModified?.('comments')) step.markModified('comments');
    if (step.isModified?.('activityLog')) step.markModified('activityLog');
    try {
      await step.save();
      return step;
    } catch (err) {
      if (isVersionError(err) && attempt < maxAttempts - 1) continue;
      throw err;
    }
  }
  throw new Error('Could not save — please try again');
}

export function serializePipelineStep(step) {
  const plain = step?.toObject ? step.toObject() : step;
  return hydrateStepTaskKinds([plain])[0];
}
