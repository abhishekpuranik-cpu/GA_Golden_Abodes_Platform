import assert from 'node:assert/strict';
import { mergeV3OrgPlannerProjectForPut } from '../server/lib/v3OrgPlannerMerge.js';

const existing = {
  ga_planner_state_v1: JSON.stringify({
    v: 2,
    ts: 1,
    projs: [
      { id: 'P001', name: 'Alpha', status: 'Active' },
      { id: 'P002', name: 'Beta', status: 'Pipeline' }
    ],
    fin: {
      P001: { plotArea: 1000, fsiMode: 'simple' },
      P002: { plotArea: 2000, fsiMode: 'pmrda' }
    },
    FUND: {
      P001: [{ id: 'm1', amount: 10 }],
      P002: [{ id: 'm2', amount: 20 }]
    },
    ddEngine: { schemaVersion: 1, runs: [{ id: 'r1' }] },
    workspace: {
      ga_rp_projects: '[]',
      ga_precon_workspace_snap_v3: 'HUGE',
      ga_cf_v1: 'CASHFLOW'
    }
  }),
  ga_rp_projects: JSON.stringify([
    { id: 'P001', name: 'Alpha', status: 'Active' },
    { id: 'P002', name: 'Beta', status: 'Pipeline' }
  ]),
  ga_user_name: 'Ops'
};

const next = mergeV3OrgPlannerProjectForPut(existing, 'P001', {
  project: { id: 'P001', name: 'Alpha Updated', status: 'Planned' },
  fin: { plotArea: 1500, fsiMode: 'holistic' },
  FUND: [{ id: 'm1', amount: 55 }],
  INVESTORS: [{ id: 'INV1', name: 'Investor 1' }],
  savedBy: 'Draft Tab',
  lastManualSave: { pid: 'P001', ts: 99 }
});

const state = JSON.parse(next.ga_planner_state_v1);
assert.equal(state.projs.length, 2);
assert.equal(state.projs.find((p) => p.id === 'P001').name, 'Alpha Updated');
assert.equal(state.projs.find((p) => p.id === 'P002').name, 'Beta');
assert.equal(state.fin.P001.plotArea, 1500);
assert.equal(state.fin.P002.plotArea, 2000);
assert.equal(state.FUND.P001[0].amount, 55);
assert.equal(state.FUND.P002[0].amount, 20);
assert.equal(state.INVESTORS.P001[0].id, 'INV1');
assert.equal(state.ddEngine.runs[0].id, 'r1');
assert.equal(state.savedBy, 'Draft Tab');
assert.equal(state.workspace.ga_rp_projects, '[]');
assert.equal(state.workspace.ga_precon_workspace_snap_v3, undefined);
assert.equal(state.workspace.ga_cf_v1, undefined);
assert.equal(JSON.parse(next.ga_v3_last_manual_save).pid, 'P001');
assert.equal(JSON.parse(next.ga_rp_projects).find((p) => p.id === 'P001').status, 'Planned');

console.log('ok: v3 project patch merge preserves siblings, slims workspace, updates only target project');
