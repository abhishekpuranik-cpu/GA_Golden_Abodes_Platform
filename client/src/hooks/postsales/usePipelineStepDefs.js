import { useEffect, useState } from 'react';
import { STEPS } from '../../data/postsales/steps.js';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { mergeStepsWithCatalog } from '../../lib/postsales/mergeStepCatalog.js';

let cachedDefs = null;
let cachePromise = null;

function loadDefs() {
  if (cachedDefs) return Promise.resolve(cachedDefs);
  if (!cachePromise) {
    cachePromise = postSalesApi
      .getSlaConfig()
      .then((data) => {
        cachedDefs = mergeStepsWithCatalog(data.steps);
        return cachedDefs;
      })
      .catch(() => {
        cachedDefs = STEPS;
        return cachedDefs;
      });
  }
  return cachePromise;
}

export function invalidatePipelineStepDefsCache() {
  cachedDefs = null;
  cachePromise = null;
}

export function usePipelineStepDefs() {
  const [defs, setDefs] = useState(cachedDefs || STEPS);

  useEffect(() => {
    let cancelled = false;
    loadDefs().then((merged) => {
      if (!cancelled) setDefs(merged);
    });
    return () => { cancelled = true; };
  }, []);

  return defs;
}
