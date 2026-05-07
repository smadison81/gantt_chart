import State from '../state.js';
import { addDays, fmtISO, fmtUS } from '../utils/dates.js';
import { escapeHtml } from '../utils/dom.js';
import { diffWorkingDays } from '../utils/calendar.js';
import { toast, setStatus } from '../utils/notify.js';
import { updateRecords } from '../api.js';
import { pushUndo, queueChange } from '../undo.js';
import { computeChartWindow } from '../chart.js';

// Injected by main.js
let _render = null;
let _applyFilters = null;

export function injectHooks(render, applyFilters) {
  _render = render;
  _applyFilters = applyFilters;
}

export function attachBarDrag(bar, task) {
  let mode = null;
  let startX = 0, origLeft = 0, origWidth = 0;
  let dayShift = 0;
  let tooltip = null;

  function currentDates() {
    const left = parseFloat(bar.style.left) || 0;
    const width = parseFloat(bar.style.width) || State.ppd;
    const startDays = Math.round(left / State.ppd);
    const endDays = Math.round((left + width) / State.ppd) - 1;
    const newStart = addDays(State.chartStart, startDays);
    const newEnd = addDays(State.chartStart, Math.max(startDays, endDays));
    return { newStart, newEnd };
  }

  function showTooltip(e) {
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "drag-tooltip";
      document.body.appendChild(tooltip);
    }
    const { newStart, newEnd } = currentDates();
    const action = mode === "resize-start" ? "Start"
                 : mode === "resize-end"   ? "End"
                 : "Move";
    const sign = dayShift > 0 ? "+" : "";
    const wdInfo = State.cfg.skipWeekends
      ? ` (${diffWorkingDays(newStart, newEnd) + 1} work days)`
      : "";
    tooltip.innerHTML = `
      <div class="name">${escapeHtml(task.name)}</div>
      <div class="dates">${fmtUS(newStart)}<span class="arrow">\u2192</span>${fmtUS(newEnd)}</div>
      <div class="meta">${action} \u2022 ${sign}${dayShift} day${Math.abs(dayShift) === 1 ? "" : "s"}${wdInfo}</div>
    `;
    tooltip.style.left = (e.clientX + 16) + "px";
    tooltip.style.top  = (e.clientY + 16) + "px";
  }

  function hideTooltip() {
    if (tooltip) { tooltip.remove(); tooltip = null; }
  }

  let _dragging = false;

  bar.addEventListener("pointerdown", e => {
    const handle = e.target.closest(".handle");
    if (handle) {
      mode = handle.dataset.handle === "left" ? "resize-start" : "resize-end";
    } else {
      mode = "move";
    }
    startX = e.clientX;
    origLeft = parseFloat(bar.style.left) || 0;
    origWidth = parseFloat(bar.style.width) || 0;
    dayShift = 0;
    _dragging = false;
  });

  bar.addEventListener("pointermove", e => {
    if (!mode) return;
    if (!_dragging) {
      if (Math.abs(e.clientX - startX) < 3) return;
      _dragging = true;
      bar.setPointerCapture(e.pointerId);
      bar.classList.add("dragging");
      showTooltip(e);
    }
    const dx = e.clientX - startX;
    dayShift = Math.round(dx / State.ppd);
    if (mode === "move") {
      bar.style.left = Math.max(0, origLeft + dayShift * State.ppd) + "px";
    } else if (mode === "resize-start") {
      const newLeft = Math.max(0, origLeft + dayShift * State.ppd);
      const delta = newLeft - origLeft;
      const newWidth = Math.max(State.ppd, origWidth - delta);
      bar.style.left = newLeft + "px";
      bar.style.width = newWidth + "px";
    } else if (mode === "resize-end") {
      const newWidth = Math.max(State.ppd, origWidth + dayShift * State.ppd);
      bar.style.width = newWidth + "px";
    }
    showTooltip(e);
  });

  bar.addEventListener("pointerup", async e => {
    if (!mode) return;
    bar.classList.remove("dragging");
    hideTooltip();
    const action = mode;
    mode = null;
    _dragging = false;
    if (dayShift === 0) return;
    try {
      if (action === "move") {
        await moveTask(task, dayShift);
      } else if (action === "resize-start") {
        await resizeTaskStart(task, dayShift);
      } else if (action === "resize-end") {
        await resizeTaskEnd(task, dayShift);
      }
    } catch (err) {
      console.error(err);
      toast("Save failed: " + err.message, "error");
      if (_render) _render();
    }
  });

  bar.addEventListener("pointercancel", () => {
    mode = null;
    bar.classList.remove("dragging");
    hideTooltip();
    if (_render) _render();
  });
}

async function moveTask(task, dayShift) {
  const newStart = addDays(task.start, dayShift);
  const newEnd = addDays(task.end, dayShift);
  await saveTaskDates(task, newStart, newEnd);

  if (State.cascadeOnMove && State.dependencies.length) {
    const cascaded = await cascadeForward(task, dayShift);
    if (cascaded > 0) toast(`Cascaded shift to ${cascaded} successor${cascaded === 1 ? "" : "s"}`, "success");
  }
}

async function resizeTaskStart(task, dayShift) {
  const newStart = addDays(task.start, dayShift);
  if (newStart >= task.end) {
    toast("Start must be before end", "error");
    if (_render) _render();
    return;
  }
  await saveTaskDates(task, newStart, task.end);
}

async function resizeTaskEnd(task, dayShift) {
  const newEnd = addDays(task.end, dayShift);
  if (newEnd <= task.start) {
    toast("End must be after start", "error");
    if (_render) _render();
    return;
  }
  await saveTaskDates(task, task.start, newEnd);
}

async function saveTaskDates(task, newStart, newEnd) {
  const { cfg } = State;
  if (cfg.readOnly) { toast("Read-only mode", "error"); if (_render) _render(); return; }

  const oldStart = new Date(task.start);
  const oldEnd = new Date(task.end);
  const startSaveFid = cfg.fidStartSave || cfg.fidStart;
  const row = {
    [3]: { value: task.rid },
    [startSaveFid]: { value: fmtISO(newStart) },
  };
  if (cfg.fidEnd) row[cfg.fidEnd] = { value: fmtISO(newEnd) };

  if (!cfg.autoSave) {
    task.start = newStart;
    task.end = newEnd;
    queueChange(task.rid, startSaveFid, fmtISO(oldStart), fmtISO(newStart));
    if (cfg.fidEnd) queueChange(task.rid, cfg.fidEnd, fmtISO(oldEnd), fmtISO(newEnd));
    pushUndo({
      type: "dates", desc: `Move ${task.name}`,
      undo() { task.start = oldStart; task.end = oldEnd; },
      redo() { task.start = newStart; task.end = newEnd; },
    });
    computeChartWindow();
    if (_applyFilters) _applyFilters();
    toast(`Queued ${task.name}`, "info");
    return;
  }

  setStatus(`Saving ${task.name}...`, "info");

  try {
    await updateRecords(
      cfg.taskDbid,
      [row],
      [3, cfg.fidStart, cfg.fidEnd, cfg.fidStartSave].filter(x => x)
    );

    pushUndo({
      type: "dates", desc: `Move ${task.name}`,
      undo() { task.start = oldStart; task.end = oldEnd; },
      redo() { task.start = newStart; task.end = newEnd; },
    });

    task.start = newStart;
    task.end = newEnd;
    computeChartWindow();
    if (_applyFilters) _applyFilters();

    setStatus(`Saved ${task.name}`, "ok");
    toast(`Saved ${task.name}`, "success");
  } catch (err) {
    console.error("Save failed:", err);
    toast("Save failed: " + err.message, "error");
    setStatus("Save failed", "err");
    if (_render) _render();
    throw err;
  }
}

export async function cascadeForward(rootTask, dayShift) {
  let count = 0;
  const visited = new Set();
  async function walk(rid) {
    if (visited.has(rid)) return;
    visited.add(rid);
    const successors = State.dependencies.filter(d => d.pred === rid).map(d => d.succ);
    for (const sRid of successors) {
      const succ = State.tasks.find(t => t.rid === sRid);
      if (!succ) continue;
      const newStart = addDays(succ.start, dayShift);
      const newEnd = addDays(succ.end, dayShift);
      await saveTaskDates(succ, newStart, newEnd);
      count++;
      await walk(sRid);
    }
  }
  await walk(rootTask.rid);
  return count;
}
