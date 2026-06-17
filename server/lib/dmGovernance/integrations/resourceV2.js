/**
 * Pull Resource Planner V2 team allocation and compute project cost.
 * @param {import('mongodb').Db} db
 * @param {string} projectId
 * @param {string} projectName
 */
export async function pullResourcePlannerData(db, projectId, projectName) {
  const stateDoc = await db.collection('app_states').findOne({ _id: 'v2_resource_planner' });
  if (!stateDoc?.data?.ga_rp_state_v1) {
    return { ok: false, error: 'v2_resource_planner state not found' };
  }

  let blob;
  try {
    blob = JSON.parse(stateDoc.data.ga_rp_state_v1);
  } catch {
    return { ok: false, error: 'Invalid ga_rp_state_v1 JSON' };
  }

  const employees = blob.employees || [];
  const teamAlloc = blob.teamAlloc || [];
  const sharedCosts = blob.sc || [];
  const projectCosts = blob.pc || [];

  const name = String(projectName || '').trim();
  const matchingAllocs = teamAlloc.filter(
    (a) => String(a.project || '').trim().toLowerCase() === name.toLowerCase()
  );

  const employeeLines = [];
  let totalEmployeeCost = 0;

  matchingAllocs.forEach((alloc) => {
    const emp = employees.find((e) => e.id === alloc.empId);
    if (!emp) return;
    const monthlyCost = Number(emp.totalCost ?? emp.totalMonthlyCost ?? 0);
    const pct = Number(alloc.pct || 0);
    const allocated = Math.round(monthlyCost * (pct / 100));
    totalEmployeeCost += allocated;
    employeeLines.push({
      empId: emp.id,
      name: emp.name,
      role: emp.role,
      department: emp.vertical,
      monthlyCost,
      allocationPct: pct,
      allocatedCost: allocated
    });
  });

  const activeProjects = (() => {
    try {
      const projs = JSON.parse(stateDoc.data.ga_rp_projects || '[]');
      return Array.isArray(projs) ? projs.filter((p) => p.on !== false).length : 1;
    } catch {
      return 1;
    }
  })();

  const sharedLines = [];
  let totalShared = 0;
  sharedCosts.forEach((sc) => {
    const monthly = Number(sc.monthly || 0);
    const share = Math.round(monthly / Math.max(activeProjects, 1));
    totalShared += share;
    sharedLines.push({
      id: sc.id,
      category: sc.cat,
      description: sc.desc,
      poolMonthly: monthly,
      allocatedCost: share
    });
  });

  const directLines = [];
  let totalDirect = 0;
  projectCosts
    .filter((pc) => String(pc.projId || '') === projectId)
    .forEach((pc) => {
      const monthly = Number(pc.monthly || 0);
      totalDirect += monthly;
      directLines.push({
        id: pc.id,
        category: pc.cat,
        description: pc.desc,
        allocatedCost: monthly
      });
    });

  const totalAllocatedCost = totalEmployeeCost + totalShared + totalDirect;

  return {
    ok: true,
    projectId,
    projectName: name,
    employeeLines,
    sharedLines,
    directLines,
    totalEmployeeCost,
    totalSharedCost: totalShared,
    totalDirectCost: totalDirect,
    totalAllocatedCost,
    syncedAt: new Date().toISOString()
  };
}

/**
 * @param {import('mongodb').Db} db
 * @param {string} projectId
 * @param {string} periodMonth
 */
export async function syncCostAllocationFromV2(db, projectId, periodMonth, userEmail) {
  const project = await db.collection('dm_projects').findOne({ _id: projectId });
  if (!project) return { ok: false, error: 'Project not found' };

  const pulled = await pullResourcePlannerData(db, projectId, project.name);
  if (!pulled.ok) return pulled;

  const now = new Date();
  const docId = `ca_${projectId}_${periodMonth}`;

  const doc = {
    _id: docId,
    projectId,
    spvId: project.spvIds?.[0] || null,
    periodMonth,
    source: 'v2_resource_planner',
    employeeLines: pulled.employeeLines,
    sharedLines: pulled.sharedLines,
    directLines: pulled.directLines,
    totalEmployeeCost: pulled.totalEmployeeCost,
    totalSharedCost: pulled.totalSharedCost,
    totalDirectCost: pulled.totalDirectCost,
    totalAllocatedCost: pulled.totalAllocatedCost,
    status: 'draft',
    locked: false,
    syncedAt: now,
    updatedAt: now,
    updatedBy: userEmail || 'system'
  };

  await db.collection('dm_cost_allocations').updateOne({ _id: docId }, { $set: doc }, { upsert: true });

  return { ok: true, allocation: doc };
}
