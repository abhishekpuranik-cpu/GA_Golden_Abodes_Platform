import DisbursementTask from '../../models/postsales/DisbursementTask.js';
import Demand from '../../models/postsales/Demand.js';
import CollectionForecast from '../../models/postsales/CollectionForecast.js';
import { agreementDueOnRow, isGstDemand } from './demandAmounts.js';
import { paymentStatusFromAmounts } from './collectionsLib.js';

function num(v) {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

export async function syncDisbursementTasksFromForecast(unit, forecastDoc, assignee) {
  if (!forecastDoc?._id) return [];
  const tasks = [];
  const existing = await DisbursementTask.find({ unitId: unit._id, status: { $in: ['open', 'delayed'] } }).lean();
  const existingByInst = new Map(existing.map((t) => [String(t.installmentId), t]));

  for (const m of forecastDoc.milestones || []) {
    for (const inst of m.installments || []) {
      if (!inst._id || num(inst.amount) <= 0 || !inst.expectedDate) continue;
      const pending = Math.max(0, num(inst.amount) - num(inst.receivedAmount));
      if (pending <= 0) continue;

      const key = String(inst._id);
      if (existingByInst.has(key)) continue;

      const task = await DisbursementTask.create({
        unitId: unit._id,
        demandId: m.demandId,
        forecastId: forecastDoc._id,
        installmentId: inst._id,
        milestoneName: m.milestoneName,
        expectedAmount: pending,
        expectedDate: inst.expectedDate,
        assignee: assignee || unit.cxExecutive || unit.crmExecutive || '',
        status: inst.riskCategory === 'delayed' ? 'delayed' : 'open',
        revisedDate: inst.revisedDate,
        note: inst.note,
      });
      tasks.push(task);
    }
  }
  return tasks;
}

export async function completeDisbursementTask(taskId, { completedAmount, note } = {}) {
  const task = await DisbursementTask.findById(taskId);
  if (!task) throw new Error('Task not found');

  const paid = num(completedAmount) || num(task.expectedAmount);
  task.status = 'complete';
  task.completedAmount = paid;
  task.completedAt = new Date();
  if (note) task.note = note;
  await task.save();

  const forecast = await CollectionForecast.findById(task.forecastId);
  if (forecast) {
    for (const m of forecast.milestones) {
      const inst = (m.installments || []).find((i) => String(i._id) === String(task.installmentId));
      if (inst) {
        inst.receivedAmount = num(inst.receivedAmount) + paid;
        inst.status = 'complete';
        if (num(inst.receivedAmount) >= num(inst.amount)) inst.riskCategory = 'clear';
      }
    }
    await forecast.save();
  }

  if (task.demandId) {
    const demand = await Demand.findById(task.demandId);
    if (demand && !isGstDemand(demand)) {
      const due = agreementDueOnRow(demand);
      const newPaid = num(demand.paidAmount) + paid;
      demand.paidAmount = newPaid;
      demand.paymentStatus = paymentStatusFromAmounts(due, newPaid);
      demand.paidDate = new Date();
      await demand.save();
    }
  }

  return task;
}

export async function delayDisbursementTask(taskId, revisedDate, note) {
  const task = await DisbursementTask.findById(taskId);
  if (!task) throw new Error('Task not found');
  task.status = 'delayed';
  task.revisedDate = new Date(revisedDate);
  if (note) task.note = note;
  await task.save();

  const forecast = await CollectionForecast.findById(task.forecastId);
  if (forecast) {
    for (const m of forecast.milestones) {
      const inst = (m.installments || []).find((i) => String(i._id) === String(task.installmentId));
      if (inst) {
        inst.riskCategory = 'delayed';
        inst.status = 'delayed';
        inst.revisedDate = new Date(revisedDate);
        if (revisedDate) inst.expectedDate = new Date(revisedDate);
      }
    }
    await forecast.save();
  }
  return task;
}
