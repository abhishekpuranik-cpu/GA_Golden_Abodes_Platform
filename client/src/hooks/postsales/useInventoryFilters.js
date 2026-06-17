import { useCallback, useEffect, useMemo, useState } from 'react';
import { postSalesApi } from '../../lib/postSalesApi.js';

export function useInventoryFilters(initial = {}) {
  const [project, setProject] = useState(initial.project || '');
  const [phase, setPhase] = useState(initial.phase || '');
  const [building, setBuilding] = useState(initial.building || '');
  const [options, setOptions] = useState({ projects: [], phases: [], buildings: [] });
  const [loadingOptions, setLoadingOptions] = useState(true);

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const data = await postSalesApi.getInventoryFilters({
        project: project || undefined,
        phase: phase || undefined,
      });
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
