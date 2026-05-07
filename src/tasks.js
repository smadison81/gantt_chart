import State from './state.js';
import { qbFetch, updateRecords } from './api.js';
import { toast, setStatus } from './utils/notify.js';
import { fmtISO, addDays } from './utils/dates.js';
import { addWorkingDays } from './utils/calendar.js';
import { pushUndo, queueChange } from './undo.js';

// Injected by main.js
let _render = null;
let _applyFilters = null;
let _computeChartWindow = null;

export function injectHooks(render, applyFilters, computeChartWindow) {
  _render = render;
  _applyFilters = applyFilters;
  _computeChartWindow = computeChartWindow;
}

export async function deleteTask(rid) {
  if (!rid) return;
  const { cfg } = State;
  const t = State.tasks.find(x => x.rid === rid);
  if (!t) return;
  if (!confirm("Delete task \"" + t.name + "\"? This cannot be undone in Quickbase.")) return;
  try {
    setStatus("Deleting...", "info");
    await qbFetch("/records", {
      method: "DELETE",
      body: JSON.stringify({ from: cfg.taskDbid, where: `{3.EX.${rid}}` }),
    }, cfg.taskDbid);
    const relatedDeps = State.dependencies.filter(d => d.pred === rid || d.succ === rid);
    for (const dep of relatedDeps) {
      try {
        await qbFetch("/records", {
          method: "DELETE",
          body: JSON.stringify({ from: cfg.depDbid, where: `{3.EX.${dep.rid}}` }),
        }, cfg.depDbid);
      } catch { /* best effort */ }
    }
    const savedTask = { ...t, raw: { ...t.raw } };
    const savedDeps = [...relatedDeps];
    State.tasks = State.tasks.filter(x => x.rid !== rid);
    State.dependencies = State.dependencies.filter(d => d.pred !== rid && d.succ !== rid);
    pushUndo({
      type: "task", desc: "Delete task: " + savedTask.name,
      undo() {
        State.tasks.push(savedTask);
        savedDeps.forEach(d => State.dependencies.push(d));
      },
      redo() {
        State.tasks = State.tasks.filter(x => x.rid !== rid);
        State.dependencies = State.dependencies.filter(d => d.pred !== rid && d.succ !== rid);
      },
    });
    closeQuickEditHook();
    if (_computeChartWindow) _computeChartWindow();
    if (_applyFilters) _applyFilters();
    toast("Task deleted", "success");
  } catch (err) {
    toast("Delete failed: " + err.message, "error");
  }
}

// closeQuickEdit is imported dynamically to avoid circular dep
let closeQuickEditHook = () => {};
export function setCloseQuickEditHook(fn) {
  closeQuickEditHook = fn;
}

export async function createTask() {
  const { cfg } = State;
  if (cfg.readOnly || !cfg.taskDbid) return;
  const name = prompt("New task name:");
  if (!name || !name.trim()) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const endDate = addWorkingDays(today, 5);
  const row = {};
  if (cfg.fidName) row[cfg.fidName] = { value: name.trim() };
  const startSaveFid = cfg.fidStartSave || cfg.fidStart;
  if (startSaveFid) row[startSaveFid] = { value: fmtISO(today) };
  if (cfg.fidEnd) row[cfg.fidEnd] = { value: fmtISO(endDate) };
  if (cfg.fidStatus) row[cfg.fidStatus] = { value: "Not Started" };
  if (cfg.fidProject && cfg.projectRid) row[cfg.fidProject] = { value: Number(cfg.projectRid) };
  try {
    setStatus("Creating task...", "info");
    const result = await qbFetch("/records", {
      method: "POST",
      body: JSON.stringify({ to: cfg.taskDbid, data: [row] }),
    }, cfg.taskDbid);
    const newRid = result.metadata ? result.metadata.createdRecordIds?.[0] : 0;
    if (!newRid) { toast("Task created but no record ID returned", "error"); return; }
    const newTask = {
      rid: newRid,
      name: name.trim(),
      status: "Not Started",
      percent: 0,
      group: "",
      assigned: "",
      priority: "",
      start: today,
      end: endDate,
      isMilestone: false,
      baselineStart: null,
      baselineEnd: null,
      parentRid: 0,
      sortOrder: 0,
      wbs: "",
      duration: 5,
      depth: 0,
      isParent: false,
      raw: {},
    };
    State.tasks.push(newTask);
    pushUndo({
      type: "task", desc: "Create task: " + name.trim(),
      undo() { State.tasks = State.tasks.filter(x => x.rid !== newRid); },
      redo() { State.tasks.push(newTask); },
    });
    if (_computeChartWindow) _computeChartWindow();
    if (_applyFilters) _applyFilters();
    toast("Task created", "success");
    // openQuickEdit is called from main.js via hook
    if (_openQuickEditHook) _openQuickEditHook(newRid);
  } catch (err) {
    toast("Create failed: " + err.message, "error");
  }
}

let _openQuickEditHook = null;
export function setOpenQuickEditHook(fn) {
  _openQuickEditHook = fn;
}

export async function saveFieldValue(task, fid, value, fieldLabel) {
  const { cfg } = State;
  if (cfg.readOnly) { toast("Read-only mode", "error"); return; }
  if (!fid) return;

  const oldVal = task.raw[fid] ? task.raw[fid].value : "";
  const row = { [3]: { value: task.rid }, [fid]: { value } };

  if (!cfg.autoSave) {
    queueChange(task.rid, fid, oldVal, value);
    pushUndo({
      type: "field", desc: `Edit ${fieldLabel} on ${task.name}`,
      undo() { if (task.raw[fid]) task.raw[fid].value = oldVal; },
      redo() { if (task.raw[fid]) task.raw[fid].value = value; },
    });
    toast(`Queued ${fieldLabel}`, "info");
    return;
  }

  try {
    await updateRecords(cfg.taskDbid, [row], [3]);
    pushUndo({
      type: "field", desc: `Edit ${fieldLabel} on ${task.name}`,
      undo() { if (task.raw[fid]) task.raw[fid].value = oldVal; },
      redo() { if (task.raw[fid]) task.raw[fid].value = value; },
    });
    toast(`Saved ${fieldLabel}`, "success");
  } catch (err) {
    toast("Save failed: " + err.message, "error");
  }
}
