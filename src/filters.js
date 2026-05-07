import State from './state.js';
import { addDays } from './utils/dates.js';

// Injected by main.js
let _render = null;
let _computeChartWindow = null;

export function injectHooks(render, computeChartWindow) {
  _render = render;
  _computeChartWindow = computeChartWindow;
}

export function applyFilters() {
  const f = State.filters;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let list = State.tasks.slice();

  if (f.search) {
    const q = f.search.toLowerCase();
    list = list.filter(t => t.name.toLowerCase().includes(q));
  }
  if (f.status) {
    list = list.filter(t => t.status === f.status);
  }
  if (!f.showMilestones) {
    list = list.filter(t => !t.isMilestone);
  }
  if (f.showLate) {
    list = list.filter(t => t.end < today && t.percent < 100);
  }
  if (f.range && f.range !== "all") {
    const days = { "30": 30, "90": 90, "180": 180, "365": 365 }[f.range];
    if (days) {
      const cutoff = addDays(today, days);
      list = list.filter(t => t.start <= cutoff && t.end >= addDays(today, -30));
    }
  }
  State.filtered = list;
  computeVisible();
  if (_render) _render();
}

export function computeVisible() {
  let list = State.filtered.slice();

  if (State.cfg.fidParentTask) {
    list = buildHierarchy(list);
  } else if (State.cfg.fidSortOrder) {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  if (State.groupBy === "none") {
    State.visible = list.map(t => ({ type: "task", task: t }));
    return;
  }
  const buckets = {};
  list.forEach(t => {
    const k = State.groupBy === "status" ? (t.status || "(no status)")
            : State.groupBy === "group" ? (t.group || "(no group)")
            : State.groupBy === "assigned" ? (t.assigned || "(unassigned)")
            : "(all)";
    if (!buckets[k]) buckets[k] = [];
    buckets[k].push(t);
  });
  const out = [];
  Object.keys(buckets).sort().forEach(k => {
    out.push({ type: "group", key: k, count: buckets[k].length });
    if (!State.groups[k]) buckets[k].forEach(t => out.push({ type: "task", task: t, group: k }));
  });
  State.visible = out;
}

export function buildHierarchy(tasks) {
  const byRid = {};
  tasks.forEach(t => { byRid[t.rid] = t; t.children = []; t.isParent = false; });

  const roots = [];
  tasks.forEach(t => {
    const parent = t.parentRid ? byRid[t.parentRid] : null;
    if (parent) {
      parent.children.push(t);
      parent.isParent = true;
    } else {
      roots.push(t);
    }
  });

  function sortChildren(node) {
    if (node.children.length) {
      node.children.sort((a, b) => a.sortOrder - b.sortOrder);
      node.children.forEach(sortChildren);
    }
  }
  roots.sort((a, b) => a.sortOrder - b.sortOrder);
  roots.forEach(sortChildren);

  function rollUp(node) {
    if (!node.children.length) return;
    node.children.forEach(rollUp);
    let minStart = node.children[0].start;
    let maxEnd = node.children[0].end;
    let totalPct = 0;
    node.children.forEach(c => {
      if (c.start && (!minStart || c.start < minStart)) minStart = c.start;
      if (c.end && (!maxEnd || c.end > maxEnd)) maxEnd = c.end;
      totalPct += c.percent;
    });
    if (minStart) node.start = minStart;
    if (maxEnd) node.end = maxEnd;
    node.percent = Math.round(totalPct / node.children.length);
  }
  roots.forEach(rollUp);

  const result = [];
  function dfs(node, depth) {
    node.depth = depth;
    result.push(node);
    if (node.isParent && State.collapsedTasks[node.rid]) return;
    node.children.forEach(c => dfs(c, depth + 1));
  }
  roots.forEach(r => dfs(r, 0));
  return result;
}

export function toggleTaskCollapse(rid) {
  State.collapsedTasks[rid] = !State.collapsedTasks[rid];
  computeVisible();
  if (_render) _render();
}

export function expandAll() {
  State.collapsedTasks = {};
  computeVisible();
  if (_render) _render();
}

export function collapseAll() {
  State.tasks.filter(t => t.isParent).forEach(t => { State.collapsedTasks[t.rid] = true; });
  computeVisible();
  if (_render) _render();
}
