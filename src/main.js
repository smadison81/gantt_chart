// CSS imports
import './styles/base.css';
import './styles/components.css';
import './styles/mobile.css';

// Module imports
import State from './state.js';
import { addDays } from './utils/dates.js';
import { loadConfig, getBoolParam } from './config.js';
import { detectMobileView } from './config.js';
import { loadTasks } from './data.js';
import { applyFilters, computeVisible, injectHooks as filtersInject } from './filters.js';
import { computeChartWindow } from './chart.js';
import { injectHooks as undoInject, undo, redo, saveAllPending } from './undo.js';
import { injectHooks as tasksInject, createTask, setCloseQuickEditHook, setOpenQuickEditHook } from './tasks.js';
import { loadPersistedSettings, persistSettings } from './persist.js';
import { renderShell, injectHooks as shellInject } from './render/shell.js';
import { renderToolbar, injectHooks as toolbarInject, setActionRefs as toolbarSetActions } from './render/toolbar.js';
import { renderFilterBar, renderStatusBar, setRenderRef as filterbarSetRender } from './render/filterbar.js';
import { renderList, injectHooks as listInject, setActionRefs as listSetActions } from './render/list.js';
import { renderTimeline, setActionRefs as timelineSetActions } from './render/timeline.js';
import { renderMobileCards, removeMobileCards, setActionRefs as mobileSetActions } from './render/mobile.js';
import { injectHooks as barDragInject } from './interactions/bar-drag.js';
import { injectHooks as progressInject } from './interactions/progress.js';
import { injectHooks as depDrawInject, setActionRefs as depDrawSetActions } from './interactions/dep-draw.js';
import { injectHooks as actionsInject, setZoom, fitToTasks, scrollToToday, selectTask, shiftWindow, toggleGroup, exportCSV, exportXLS, toggleFullscreen, scrollToTask } from './actions.js';
import { showContextMenu, dismissContextMenu, setActionRefs as menuSetActions } from './menu.js';
import { openQuickEdit, closeQuickEdit, injectHooks as quickEditInject, setApplyFiltersRef as quickEditSetApplyFilters } from './quickedit.js';
import { injectHooks as allocationsInject, setActionRefs as allocationsSetActions } from './allocations.js';
import { validateSchedule, injectHooks as validateInject } from './validate.js';
import { showError, setStatus } from './utils/notify.js';
import { startWizard } from './wizard.js';
import { deleteTask } from './tasks.js';

// Central render function
function render() {
  const showCards = detectMobileView();
  renderToolbar(showCards);
  renderStatusBar();
  renderFilterBar(showCards);
  const main = document.getElementById("main");
  if (showCards) {
    if (main) main.classList.add("mobile-hidden");
    renderMobileCards();
    const fab = document.getElementById("mobile-fab");
    if (fab) fab.style.display = "";
  } else {
    if (main) main.classList.remove("mobile-hidden");
    removeMobileCards();
    renderList();
    renderTimeline();
  }
  persistSettings();
}

// Wire injectHooks: pass render and sibling functions into each module
filtersInject(render, computeChartWindow);
undoInject(render, applyFilters, computeChartWindow);
tasksInject(render, applyFilters, computeChartWindow);
actionsInject(render);
shellInject(render);
toolbarInject(render);
listInject(render);
barDragInject(render, applyFilters);
progressInject(render);
depDrawInject(render);
quickEditInject(render);
validateInject(render);
allocationsInject(render);

// Wire action refs (avoids circular imports for action functions)
const sharedActionRefs = {
  selectTask,
  openQuickEdit,
  showContextMenu,
  deleteTask,
};

toolbarSetActions({
  setZoom, fitToTasks, scrollToToday, shiftWindow,
  validateSchedule, exportCSV, exportXLS, toggleFullscreen,
});
listSetActions(sharedActionRefs);
timelineSetActions(sharedActionRefs);
mobileSetActions({ openQuickEdit });
depDrawSetActions({ openQuickEdit });
allocationsSetActions({ openQuickEdit });
menuSetActions({ openQuickEdit, deleteTask });
filterbarSetRender(render);
quickEditSetApplyFilters(applyFilters);
setCloseQuickEditHook(closeQuickEdit);
setOpenQuickEditHook(openQuickEdit);

// Keyboard shortcuts
document.addEventListener("keydown", e => {
  if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
  if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); return; }
  if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); return; }
  if (e.ctrlKey && e.key === "s" && !State.cfg.autoSave) { e.preventDefault(); saveAllPending(); return; }
  if (e.key === "t" || e.key === "T") scrollToToday();
  if (e.key === "f" || e.key === "F") fitToTasks();
  if (e.key === "Escape") { closeQuickEdit(); dismissContextMenu(); }
  if (e.key === "F11") { e.preventDefault(); toggleFullscreen(); return; }
  if (e.key === "Insert" && !State.cfg.readOnly) { createTask(); return; }
  if (e.key === "1") setZoom("day");
  if (e.key === "2") setZoom("week");
  if (e.key === "3") setZoom("month");
  if (e.key === "4") setZoom("quarter");
  if (e.key === "5") setZoom("all");
  if (e.key === "v" || e.key === "V") validateSchedule();
  if (e.key === "ArrowLeft" && !e.ctrlKey) shiftWindow(-1);
  if (e.key === "ArrowRight" && !e.ctrlKey) shiftWindow(1);
});

// Fullscreen change listener
document.addEventListener("fullscreenchange", () => { renderToolbar(); });

// Boot
async function boot() {
  if (getBoolParam("setup")) {
    startWizard();
    return;
  }
  loadConfig();
  if (!State.cfg.taskDbid || !State.cfg.fidName || !State.cfg.fidStart || !State.cfg.fidEnd) {
    showError(new Error("Missing required config. Append &setup=true to run the setup wizard."));
    return;
  }
  loadPersistedSettings();
  State.chartStart = addDays(new Date(), -30);
  State.chartEnd = addDays(new Date(), 90);
  renderShell();
  setStatus("Loading tasks...", "info");
  try {
    await loadTasks();
    applyFilters();
    setTimeout(scrollToToday, 100);
  } catch (e) {
    showError(e);
  }
}

boot();
