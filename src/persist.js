import State, { ZOOM_LEVELS } from './state.js';

export function getSettingsKey() {
  const { cfg } = State;
  return `qb-gantt-${cfg.taskDbid}-${cfg.projectRid || "all"}`;
}

export function loadPersistedSettings() {
  try {
    const key = getSettingsKey();
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.zoom && ZOOM_LEVELS[s.zoom]) { State.zoom = s.zoom; State.ppd = ZOOM_LEVELS[s.zoom].ppd; }
    if (s.groupBy) State.groupBy = s.groupBy;
    if (s.showBaselines !== undefined) State.showBaselines = s.showBaselines;
    if (s.showDeps !== undefined) State.showDeps = s.showDeps;
    if (s.showLabels !== undefined) State.showLabels = s.showLabels;
    if (s.collapsedTasks) State.collapsedTasks = s.collapsedTasks;
    if (Array.isArray(s.columnOrder) && s.columnOrder.length === 4) State.columnOrder = s.columnOrder;
    if (s.mobileView) State.mobileView = s.mobileView;
  } catch { /* ignore */ }
}

export function persistSettings() {
  try {
    const key = getSettingsKey();
    localStorage.setItem(key, JSON.stringify({
      zoom: State.zoom,
      groupBy: State.groupBy,
      showBaselines: State.showBaselines,
      showDeps: State.showDeps,
      showLabels: State.showLabels,
      collapsedTasks: State.collapsedTasks,
      columnOrder: State.columnOrder,
      mobileView: State.mobileView,
    }));
  } catch { /* ignore */ }
}
