import State from './state.js';
import { toast } from './utils/notify.js';
import { updateRecords } from './api.js';
import { setStatus } from './utils/notify.js';
import { loadTasks } from './data.js';
import { showError } from './utils/notify.js';

// Injected by main.js
let _render = null;
let _applyFilters = null;
let _computeChartWindow = null;

export function injectHooks(render, applyFilters, computeChartWindow) {
  _render = render;
  _applyFilters = applyFilters;
  _computeChartWindow = computeChartWindow;
}

export function pushUndo(entry) {
  State.undoStack.push(entry);
  if (State.undoStack.length > 50) State.undoStack.shift();
  State.redoStack = [];
}

export function undo() {
  const entry = State.undoStack.pop();
  if (!entry) return;
  entry.undo();
  State.redoStack.push(entry);
  if (_computeChartWindow) _computeChartWindow();
  if (_applyFilters) _applyFilters();
  toast("Undo: " + entry.desc);
}

export function redo() {
  const entry = State.redoStack.pop();
  if (!entry) return;
  entry.redo();
  State.undoStack.push(entry);
  if (_computeChartWindow) _computeChartWindow();
  if (_applyFilters) _applyFilters();
  toast("Redo: " + entry.desc);
}

export function queueChange(rid, fid, oldVal, newVal) {
  const key = `${rid}_${fid}`;
  const existing = State.pendingChanges.find(c => `${c.rid}_${c.fid}` === key);
  if (existing) {
    existing.newVal = newVal;
  } else {
    State.pendingChanges.push({ rid, fid, oldVal, newVal });
  }
}

export async function saveAllPending() {
  if (!State.pendingChanges.length) return;
  const { cfg } = State;
  const byRid = {};
  State.pendingChanges.forEach(c => {
    if (!byRid[c.rid]) byRid[c.rid] = { [3]: { value: c.rid } };
    byRid[c.rid][c.fid] = { value: c.newVal };
  });
  try {
    setStatus("Saving all pending changes...", "info");
    await updateRecords(cfg.taskDbid, Object.values(byRid), [3]);
    const count = State.pendingChanges.length;
    State.pendingChanges = [];
    toast(`Saved ${count} change${count === 1 ? "" : "s"}`, "success");
    setStatus("All changes saved", "ok");
    if (_render) _render();
  } catch (err) {
    toast("Batch save failed: " + err.message, "error");
    setStatus("Save failed", "err");
  }
}

export function discardAllPending() {
  if (!State.pendingChanges.length) return;
  State.pendingChanges = [];
  State.undoStack = [];
  State.redoStack = [];
  loadTasks().catch(showError);
}
