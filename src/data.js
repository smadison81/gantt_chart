import State from './state.js';
import { queryRecords } from './api.js';
import { parseDate, fmtISO } from './utils/dates.js';
import { setStatus } from './utils/notify.js';
import { computeChartWindow } from './chart.js';

export function fv(row, fid) {
  if (!fid || !row[fid]) return "";
  const v = row[fid].value;
  return v === undefined || v === null ? "" : v;
}

export function firstFv(row, fids) {
  for (const f of fids) {
    const v = fv(row, f);
    if (v !== "" && v !== null && v !== undefined) return v;
  }
  return "";
}

export function mapTask(row) {
  const { cfg } = State;
  const displayStart = fv(row, cfg.fidStart);
  const editableStart = cfg.fidStartSave ? fv(row, cfg.fidStartSave) : "";
  const startVal = displayStart || editableStart;
  const endVal = fv(row, cfg.fidEnd);
  const start = parseDate(startVal);
  let end = parseDate(endVal);
  if (start && !end) end = start;

  const name = String(firstFv(row, [cfg.fidName, 3]) || "Untitled");
  const status = String(fv(row, cfg.fidStatus) || "");
  const percent = Number(fv(row, cfg.fidPercent) || 0);
  const groupVal = String(fv(row, cfg.fidGroup) || "");
  const assigned = String(fv(row, cfg.fidAssigned) || "");
  const milestoneFlag = fv(row, cfg.fidMilestone);
  const priority = String(fv(row, cfg.fidPriority) || "");

  const isMilestone = milestoneFlag === true ||
    (start && end && fmtISO(start) === fmtISO(end) && !cfg.fidEnd);

  const baselineStart = parseDate(fv(row, cfg.fidBaselineStart));
  const baselineEnd = parseDate(fv(row, cfg.fidBaselineEnd));

  return {
    rid: fv(row, 3),
    name, status, percent: isNaN(percent) ? 0 : Math.max(0, Math.min(100, percent)),
    group: groupVal, assigned, priority,
    start, end, isMilestone,
    baselineStart, baselineEnd,
    parentRid: Number(fv(row, cfg.fidParentTask) || 0),
    sortOrder: Number(fv(row, cfg.fidSortOrder) || 0),
    wbs: String(fv(row, cfg.fidWbs) || ""),
    duration: Number(fv(row, cfg.fidDuration) || 0),
    depth: 0,
    isParent: false,
    raw: row,
  };
}

async function loadDeps() {
  const { cfg } = State;
  const select = [3, cfg.fidDepPred, cfg.fidDepSucc, cfg.fidDepLag, cfg.fidDepProject, cfg.fidDepType].filter(x => x && x > 0);
  const where = (cfg.fidDepProject && cfg.projectRid)
    ? `{${cfg.fidDepProject}.EX.${cfg.projectRid}}` : undefined;
  const result = await queryRecords(cfg.depDbid, { select, where, options: { top: 1000 } });
  State.dependencies = (result.data || []).map(r => ({
    rid: fv(r, 3),
    pred: Number(fv(r, cfg.fidDepPred) || 0),
    succ: Number(fv(r, cfg.fidDepSucc) || 0),
    lag: Number(fv(r, cfg.fidDepLag) || 0),
    type: String(fv(r, cfg.fidDepType) || "FS").toUpperCase(),
  })).filter(d => d.pred && d.succ);
}

export async function loadTasks() {
  const { cfg } = State;
  setStatus("Loading tasks...", "info");

  const select = [
    3,
    cfg.fidName, cfg.fidStart, cfg.fidEnd,
    cfg.fidStartSave, cfg.fidStatus, cfg.fidPercent,
    cfg.fidGroup, cfg.fidAssigned, cfg.fidMilestone, cfg.fidPriority,
    cfg.fidBaselineStart, cfg.fidBaselineEnd,
    cfg.fidProject,
    cfg.fidParentTask, cfg.fidSortOrder, cfg.fidWbs, cfg.fidDuration,
  ].filter(x => x && x > 0);

  const where = [];
  if (cfg.projectRid && cfg.fidProject) {
    where.push(`{${cfg.fidProject}.EX.${cfg.projectRid}}`);
  }
  if (cfg.fidStart) where.push(`{${cfg.fidStart}.XEX.''}`);

  const body = {
    select,
    where: where.join("AND") || undefined,
    sortBy: [
      { fieldId: cfg.fidStart, order: "ASC" },
      { fieldId: 3, order: "ASC" },
    ],
    options: { top: 1000, skip: 0 },
  };

  const result = await queryRecords(cfg.taskDbid, body);
  State.records = result.data || [];
  State.tasks = State.records.map(mapTask).filter(t => t.start && t.end);
  State.filtered = State.tasks;

  if (cfg.depDbid && cfg.fidDepPred && cfg.fidDepSucc) {
    try { await loadDeps(); }
    catch (e) { console.warn("Deps load failed:", e); }
  }

  computeChartWindow();
  // NOTE: applyFilters is called by boot() after loadTasks, not here
  setStatus(`Loaded ${State.tasks.length} task${State.tasks.length === 1 ? "" : "s"}`, "ok");
}
