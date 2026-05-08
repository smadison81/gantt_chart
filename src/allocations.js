import State from './state.js';
import { qbFetch, updateRecords } from './api.js';
import { fmtISO } from './utils/dates.js';
import { toast } from './utils/notify.js';
import { pushUndo } from './undo.js';

let _render = null;
let _openQuickEdit = null;

export function injectHooks(render) {
  _render = render;
}

export function setActionRefs(refs) {
  _openQuickEdit = refs.openQuickEdit;
}

export function allocationsForTask(taskRid) {
  return State.allocations.filter(a => a.taskRid === taskRid);
}

export function resourceById(rid) {
  return State.resources.find(r => r.rid === rid) || null;
}

export function initials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export async function createAllocation(taskRid, resourceRid) {
  const { cfg } = State;
  if (!cfg.allocDbid || !cfg.fidAllocTask || !cfg.fidAllocResource) {
    toast("Resource allocation table not configured", "error");
    return;
  }
  const task = State.tasks.find(t => t.rid === taskRid);
  if (!task) return;
  if (State.allocations.some(a => a.taskRid === taskRid && a.resourceRid === resourceRid)) {
    toast("That resource is already assigned", "error");
    return;
  }

  const start = task.start ? fmtISO(task.start) : "";
  const end = task.end ? fmtISO(task.end) : "";
  const data = {};
  data[cfg.fidAllocTask] = { value: taskRid };
  data[cfg.fidAllocResource] = { value: resourceRid };
  if (cfg.fidAllocProject && cfg.projectRid) data[cfg.fidAllocProject] = { value: Number(cfg.projectRid) };
  if (cfg.fidAllocStart && start) data[cfg.fidAllocStart] = { value: start };
  if (cfg.fidAllocEnd && end) data[cfg.fidAllocEnd] = { value: end };

  try {
    const res = await updateRecords(cfg.allocDbid, [data], [3]);
    const newRid = Number(res?.data?.[0]?.[3]?.value);
    if (!newRid) throw new Error("No record ID returned");

    const alloc = {
      rid: newRid,
      projectRid: Number(cfg.projectRid) || 0,
      taskRid,
      resourceRid,
      start: task.start || null,
      end: task.end || null,
    };
    State.allocations.push(alloc);

    pushUndo({
      type: "alloc", desc: "Add resource",
      undo() { State.allocations = State.allocations.filter(a => a.rid !== newRid); },
      redo() { State.allocations.push(alloc); },
    });

    toast("Resource assigned", "success");
    if (_render) _render();
    if (_openQuickEdit && State.selectedRid === taskRid) _openQuickEdit(taskRid);
  } catch (err) {
    toast("Failed to assign resource: " + err.message, "error");
  }
}

export async function deleteAllocation(allocRid) {
  const { cfg } = State;
  if (!cfg.allocDbid || !allocRid) return;
  const alloc = State.allocations.find(a => a.rid === allocRid);
  if (!alloc) return;
  try {
    await qbFetch("/records", {
      method: "DELETE",
      body: JSON.stringify({ from: cfg.allocDbid, where: `{3.EX.${allocRid}}` }),
    }, cfg.allocDbid);
    State.allocations = State.allocations.filter(a => a.rid !== allocRid);

    pushUndo({
      type: "alloc", desc: "Remove resource",
      undo() { State.allocations.push(alloc); },
      redo() { State.allocations = State.allocations.filter(a => a.rid !== allocRid); },
    });

    toast("Resource removed", "success");
    if (_render) _render();
    if (_openQuickEdit && State.selectedRid === alloc.taskRid) _openQuickEdit(alloc.taskRid);
  } catch (err) {
    toast("Failed to remove resource: " + err.message, "error");
  }
}
