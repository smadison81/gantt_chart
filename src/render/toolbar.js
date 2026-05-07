import State from '../state.js';
import { el } from '../utils/dom.js';
import { isMobile, detectMobileView } from '../config.js';
import { undo, redo, saveAllPending, discardAllPending } from '../undo.js';
import { expandAll, collapseAll, computeVisible } from '../filters.js';
import { createTask } from '../tasks.js';
import { loadTasks } from '../data.js';
import { showError } from '../utils/notify.js';

// Injected by main.js
let _render = null;

export function injectHooks(render) {
  _render = render;
}

// These will be set by main.js to avoid circular imports
let _setZoom, _fitToTasks, _scrollToToday, _shiftWindow, _validateSchedule;
let _exportCSV, _exportXLS, _toggleFullscreen;

export function setActionRefs(refs) {
  _setZoom = refs.setZoom;
  _fitToTasks = refs.fitToTasks;
  _scrollToToday = refs.scrollToToday;
  _shiftWindow = refs.shiftWindow;
  _validateSchedule = refs.validateSchedule;
  _exportCSV = refs.exportCSV;
  _exportXLS = refs.exportXLS;
  _toggleFullscreen = refs.toggleFullscreen;
}

export function renderToolbar(showCards = false) {
  const tb = document.getElementById("toolbar");
  if (!tb) return;
  const z = State.zoom;
  tb.innerHTML = "";

  tb.appendChild(el("h1", {}, [
    State.cfg.title,
    el("span", { class: "sub" }, [`${State.tasks.length} task${State.tasks.length === 1 ? "" : "s"}`]),
  ]));

  if (State.cfg.readOnly) {
    tb.appendChild(el("span", { class: "readonly-pill" }, ["Read-Only"]));
  }

  if (isMobile()) {
    tb.appendChild(el("div", { class: "spacer" }));
    tb.appendChild(el("button", {
      class: "btn ghost", onclick: toggleFilterBar, title: "Filters",
    }, ["\u2630 Filter"]));
    const viewLabel = showCards ? "Gantt" : "Cards";
    tb.appendChild(el("button", {
      class: "btn ghost", onclick: toggleMobileView,
    }, [viewLabel]));
    tb.appendChild(el("button", {
      class: "btn ghost", onclick: toggleOverflowMenu, title: "More",
    }, ["\u22EE"]));
    renderOverflowMenu();
    return;
  }

  tb.appendChild(el("div", { class: "spacer" }));

  const undoBtn = el("button", {
    class: "btn ghost", onclick: undo, title: "Undo (Ctrl+Z)",
  }, [`Undo${State.undoStack.length ? " (" + State.undoStack.length + ")" : ""}`]);
  if (!State.undoStack.length) undoBtn.disabled = true;
  tb.appendChild(undoBtn);

  const redoBtn = el("button", {
    class: "btn ghost", onclick: redo, title: "Redo (Ctrl+Y)",
  }, [`Redo${State.redoStack.length ? " (" + State.redoStack.length + ")" : ""}`]);
  if (!State.redoStack.length) redoBtn.disabled = true;
  tb.appendChild(redoBtn);

  if (State.cfg.fidParentTask) {
    tb.appendChild(el("button", { class: "btn ghost", onclick: expandAll, title: "Expand all groups" }, ["Expand"]));
    tb.appendChild(el("button", { class: "btn ghost", onclick: collapseAll, title: "Collapse all groups" }, ["Collapse"]));
  }

  if (!State.cfg.autoSave) {
    const pc = State.pendingChanges.length;
    const saveBtn = el("button", { class: "btn primary", onclick: saveAllPending }, ["Save"]);
    if (pc) saveBtn.appendChild(el("span", { class: "badge" }, [String(pc)]));
    if (!pc) saveBtn.disabled = true;
    tb.appendChild(saveBtn);
    const discardBtn = el("button", { class: "btn danger", onclick: discardAllPending }, ["Discard"]);
    if (!pc) discardBtn.disabled = true;
    tb.appendChild(discardBtn);
  }

  const seg = el("div", { class: "seg" });
  ["day", "week", "month", "quarter", "all"].forEach(k => {
    const b = el("button", {
      class: z === k ? "active" : "",
      onclick: () => { if (_setZoom) _setZoom(k); }
    }, [k === "all" ? "All" : k.charAt(0).toUpperCase() + k.slice(1)]);
    seg.appendChild(b);
  });
  tb.appendChild(seg);

  tb.appendChild(el("button", { class: "btn ghost", onclick: () => { if (_shiftWindow) _shiftWindow(-1); }, title: "Scroll left" }, ["\u25C0"]));
  tb.appendChild(el("button", { class: "btn ghost", onclick: () => { if (_shiftWindow) _shiftWindow(1); }, title: "Scroll right" }, ["\u25B6"]));
  tb.appendChild(el("button", { class: "btn ghost", onclick: () => { if (_scrollToToday) _scrollToToday(); } }, ["Today"]));
  tb.appendChild(el("button", { class: "btn ghost", onclick: () => { if (_fitToTasks) _fitToTasks(); } }, ["Fit"]));

  const groupSel = el("select", {
    class: "btn",
    style: { padding: "6px 10px" },
    onchange: e => { State.groupBy = e.target.value; State.groups = {}; computeVisible(); if (_render) _render(); }
  });
  ["none", "status", "group", "assigned"].forEach(k => {
    const opt = el("option", { value: k }, [k === "none" ? "No group" : "Group: " + k]);
    if (State.groupBy === k) opt.selected = true;
    groupSel.appendChild(opt);
  });
  tb.appendChild(groupSel);

  tb.appendChild(el("button", { class: "btn", onclick: () => { if (_validateSchedule) _validateSchedule(); } }, ["Validate"]));
  tb.appendChild(el("button", { class: "btn ghost", onclick: () => { if (_exportCSV) _exportCSV(); }, title: "Export CSV" }, ["CSV"]));
  tb.appendChild(el("button", { class: "btn ghost", onclick: () => { if (_exportXLS) _exportXLS(); }, title: "Export Excel" }, ["Excel"]));
  tb.appendChild(el("button", { class: "btn ghost", onclick: () => { if (_toggleFullscreen) _toggleFullscreen(); }, title: "Toggle fullscreen (F11)" }, [document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen"]));

  if (!State.cfg.readOnly) {
    tb.appendChild(el("button", { class: "btn", onclick: createTask, title: "Create new task (Insert)" }, ["+ Task"]));
  }

  tb.appendChild(el("button", { class: "btn primary", onclick: () => loadTasks().catch(showError) }, ["Refresh"]));
}

export function renderOverflowMenu() {
  const panel = document.getElementById("overflow-panel");
  if (!panel) return;
  panel.innerHTML = "";

  function item(label, action) {
    const btn = el("button", { class: "overflow-item", onclick: () => { toggleOverflowMenu(); action(); }}, [label]);
    panel.appendChild(btn);
  }
  function sep() { panel.appendChild(el("div", { class: "overflow-sep" })); }
  function lbl(text) { panel.appendChild(el("div", { class: "overflow-label" }, [text])); }

  lbl("Actions");
  item("Refresh", () => loadTasks().catch(showError));
  if (State.undoStack.length) item("Undo (" + State.undoStack.length + ")", undo);
  if (State.redoStack.length) item("Redo (" + State.redoStack.length + ")", redo);
  if (!State.cfg.autoSave && State.pendingChanges.length) {
    item("Save (" + State.pendingChanges.length + ")", saveAllPending);
    item("Discard changes", discardAllPending);
  }
  sep();

  lbl("Navigation");
  item("Today", () => { if (_scrollToToday) _scrollToToday(); });
  item("Fit to tasks", () => { if (_fitToTasks) _fitToTasks(); });
  item("\u25C0 Previous", () => { if (_shiftWindow) _shiftWindow(-1); });
  item("\u25B6 Next", () => { if (_shiftWindow) _shiftWindow(1); });
  sep();

  lbl("View");
  item("Validate schedule", () => { if (_validateSchedule) _validateSchedule(); });
  item("Export CSV", () => { if (_exportCSV) _exportCSV(); });
  item("Export Excel", () => { if (_exportXLS) _exportXLS(); });
  if (State.cfg.fidParentTask) {
    item("Expand all", expandAll);
    item("Collapse all", collapseAll);
  }
  item(document.fullscreenElement ? "Exit fullscreen" : "Fullscreen", () => { if (_toggleFullscreen) _toggleFullscreen(); });
  sep();

  lbl("Zoom");
  const seg = el("div", { class: "seg", style: { margin: "4px 16px" }});
  ["day", "week", "month", "quarter", "all"].forEach(k => {
    seg.appendChild(el("button", {
      class: State.zoom === k ? "active" : "",
      onclick: () => { toggleOverflowMenu(); if (_setZoom) _setZoom(k); },
    }, [k === "all" ? "All" : k.charAt(0).toUpperCase() + k.slice(1)]));
  });
  panel.appendChild(seg);
  sep();

  lbl("Group By");
  const groupSel = el("select", {
    class: "btn", style: { margin: "4px 16px", width: "calc(100% - 32px)" },
    onchange: e => { toggleOverflowMenu(); State.groupBy = e.target.value; State.groups = {}; computeVisible(); if (_render) _render(); }
  });
  ["none", "status", "group", "assigned"].forEach(k => {
    const opt = el("option", { value: k }, [k === "none" ? "No group" : "Group: " + k]);
    if (State.groupBy === k) opt.selected = true;
    groupSel.appendChild(opt);
  });
  panel.appendChild(groupSel);
}

export function toggleOverflowMenu() {
  const panel = document.getElementById("overflow-panel");
  const backdrop = document.getElementById("overflow-backdrop");
  if (!panel || !backdrop) return;
  const opening = !panel.classList.contains("open");
  panel.classList.toggle("open");
  backdrop.classList.toggle("open");
  if (opening) {
    backdrop.onclick = toggleOverflowMenu;
  }
}

export function toggleFilterBar() {
  const fb = document.getElementById("filterbar");
  if (fb) fb.classList.toggle("expanded");
}

export function toggleMobileView() {
  const current = detectMobileView();
  State.mobileView = current ? "gantt" : "cards";
  if (_render) _render();
}
