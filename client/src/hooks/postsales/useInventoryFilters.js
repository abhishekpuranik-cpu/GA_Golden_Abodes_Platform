import { useCallback, useEffect, useMemo, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { cacheKey, cachedFetch } from '../../lib/postsales/postSalesCache.js';

const FILTER_STORAGE_KEY = 'ps_inventory_filters';

function readStoredFilters() {
  try {
    const raw = sessionStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      project: parsed.project || '',
      phase: parsed.phase || '',
      building: parsed.building || '',
    };
  } catch {
    return {};
  }
}

function writeStoredFilters(project, phase, building) {
  try {
    sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ project, phase, building }));
  } catch {
    /* ignore */
  }
}

export function useInventoryFilters(initial = {}) {
  const stored = readStoredFilters();
  const [project, setProject] = useState(initial.project ?? stored.project ?? '');
  const [phase, setPhase] = useState(initial.phase ?? stored.phase ?? '');
  const [building, setBuilding] = useState(initial.building ?? stored.building ?? '');
  const [options, setOptions] = useState({ projects: [], phases: [], buildings: [] });
  const [loadingOptions, setLoadingOptions] = useState(true);

  useEffect(() => {
    writeStoredFilters(project, phase, building);
  }, [project, phase, building]);

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const key = cacheKey(['inv-filters', project || '', phase || '']);
      const data = await cachedFetch(key, () => postSalesApi.getInventoryFilters({
        project: project || undefined,
        phase: phase || undefined,
      }));
      setOptions(data);
    } catch {
      setOptions({ projects: [], phases: [], buildings: [] });
    } finally {
      setLoadingOptions(false);
    }
  }, [project, phase]);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  const setProjectFilter = (value) => {
    setProject(value);
    setPhase('');
    setBuilding('');
  };

  const setPhaseFilter = (value) => {
    setPhase(value);
    setBuilding('');
  };

  const query = useMemo(() => {
    const q = {};
    if (project) q.project = project;
    if (phase) q.phase = phase;
    if (building) q.building = building;
    return q;
  }, [project, phase, building]);

  return {
    project,
    phase,
    building,
    setProject: setProjectFilter,
    setPhase: setPhaseFilter,
    setBuilding,
    options,
    loadingOptions,
    query,
    loadOptions,
    clear: () => {
      setProject('');
      setPhase('');
      setBuilding('');
    },
  };
}
