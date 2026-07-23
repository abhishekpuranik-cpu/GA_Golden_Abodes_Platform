import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';
import { cacheKey, cachedFetch, getCached } from '../../lib/postsales/postSalesCache.js';

const PostSalesFilterContext = createContext(null);

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

export function useInventoryFiltersInternal(initial = {}) {
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
    const key = cacheKey(['inv-filters', project || '', phase || '']);
    const cached = getCached(key);
    if (cached) {
      setOptions(cached);
      setLoadingOptions(false);
    } else {
      setLoadingOptions(true);
    }
    try {
      const data = await cachedFetch(key, () => postSalesApi.getInventoryFilters({
        project: project || undefined,
        phase: phase || undefined,
      }), 10 * 60 * 1000);
      setOptions(data);
    } catch {
      setOptions({ projects: [], phases: [], buildings: [] });
    } finally {
      setLoadingOptions(false);
    }
  }, [project, phase]);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  // Phase/building require a project; drop stale values when options change.
  useEffect(() => {
    if (!project) {
      if (phase) setPhase('');
      if (building) setBuilding('');
      return;
    }
    if (loadingOptions) return;
    if (phase && (!options.phases?.length || !options.phases.includes(phase))) {
      setPhase('');
    }
    if (building && (!options.buildings?.length || !options.buildings.includes(building))) {
      setBuilding('');
    }
  }, [project, phase, building, options.phases, options.buildings, loadingOptions]);

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

export function PostSalesFilterProvider({ children }) {
  const value = useInventoryFiltersInternal();
  return createElement(PostSalesFilterContext.Provider, { value }, children);
}

export function useInventoryFilters(initial = {}) {
  const ctx = useContext(PostSalesFilterContext);
  if (ctx) return ctx;
  return useInventoryFiltersInternal(initial);
}
