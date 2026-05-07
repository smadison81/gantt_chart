import State from '../state.js';
import { qbFetch } from '../api.js';
import { toast } from '../utils/notify.js';
import { pushUndo } from '../undo.js';

// Injected by main.js
let _render = null;

export function injectHooks(render) {
  _render = render;
}

// Set by main.js
let _openQuickEdit = null;

export function setActionRefs(refs) {
  _openQuickEdit = refs.openQuickEdit;
}

export function attachDepDraw(connector, predTask) {
  connector.addEventListener("pointerdown", e => {
    e.stopPropagation();
    e.preventDefault();
    connector.setPointerCapture(e.pointerId);

    const inner = document.getElementById("timeline-inner");
    const scroll = document.getElementById("timeline-scroll");
    if (!inner || !scroll) return;
    const ns = "http://www.w3.org/2000/svg";

    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", "dep-svg");
    svg.style.width = inner.style.width;
    svg.style.height = inner.style.minHeight || "100%";
    svg.setAttribute("width", parseInt(inner.style.width) || 2000);
    svg.setAttribute("height", parseInt(inner.style.minHeight) || 2000);
    svg.style.pointerEvents = "none";

    const line = document.createElementNS(ns, "line");
    line.setAttribute("class", "dep-draw-line");
    const rect = connector.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    const startX = rect.right - scrollRect.left + scroll.scrollLeft;
    const startY = rect.top + rect.height / 2 - scrollRect.top + scroll.scrollTop;
    line.setAttribute("x1", startX);
    line.setAttribute("y1", startY);
    line.setAttribute("x2", startX);
    line.setAttribute("y2", startY);
    svg.appendChild(line);
    inner.appendChild(svg);

    const onMove = ev => {
      const mx = ev.clientX - scrollRect.left + scroll.scrollLeft;
      const my = ev.clientY - scrollRect.top + scroll.scrollTop;
      line.setAttribute("x2", mx);
      line.setAttribute("y2", my);
    };
    const onUp = ev => {
      connector.removeEventListener("pointermove", onMove);
      connector.removeEventListener("pointerup", onUp);
      svg.remove();
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const targetBar = target ? target.closest(".bar[data-rid]") : null;
      if (targetBar) {
        const succRid = Number(targetBar.dataset.rid);
        if (succRid && succRid !== predTask.rid) {
          createDependency(predTask.rid, succRid, "FS", 0);
        }
      }
    };
    connector.addEventListener("pointermove", onMove);
    connector.addEventListener("pointerup", onUp);
  });
}

export async function createDependency(predRid, succRid, type, lag) {
  const { cfg } = State;
  if (!cfg.depDbid) return;

  const exists = State.dependencies.some(d => d.pred === predRid && d.succ === succRid);
  if (exists) { toast("Dependency already exists", "error"); return; }

  const row = {
    [cfg.fidDepPred]: { value: predRid },
    [cfg.fidDepSucc]: { value: succRid },
  };
  if (cfg.fidDepType) row[cfg.fidDepType] = { value: type };
  if (cfg.fidDepLag) row[cfg.fidDepLag] = { value: lag };
  if (cfg.fidDepProject && cfg.projectRid) row[cfg.fidDepProject] = { value: Number(cfg.projectRid) };

  try {
    const result = await qbFetch("/records", {
      method: "POST",
      body: JSON.stringify({ to: cfg.depDbid, data: [row] }),
    }, cfg.depDbid);
    const newRid = result.metadata ? result.metadata.createdRecordIds?.[0] : 0;
    State.dependencies.push({ rid: newRid, pred: predRid, succ: succRid, type, lag });
    pushUndo({
      type: "dep", desc: "Create dependency",
      undo() { State.dependencies = State.dependencies.filter(d => d.rid !== newRid); },
      redo() { State.dependencies.push({ rid: newRid, pred: predRid, succ: succRid, type, lag }); },
    });
    toast("Dependency created", "success");
    if (_render) _render();
    if (_openQuickEdit && (State.selectedRid === predRid || State.selectedRid === succRid)) _openQuickEdit(State.selectedRid);
  } catch (err) {
    toast("Failed to create dependency: " + err.message, "error");
  }
}

export async function deleteDependency(depRid) {
  const { cfg } = State;
  if (!cfg.depDbid || !depRid) return;
  const dep = State.dependencies.find(d => d.rid === depRid);
  if (!dep) return;
  try {
    await qbFetch("/records", {
      method: "DELETE",
      body: JSON.stringify({ from: cfg.depDbid, where: `{3.EX.${depRid}}` }),
    }, cfg.depDbid);
    State.dependencies = State.dependencies.filter(d => d.rid !== depRid);
    pushUndo({
      type: "dep", desc: "Delete dependency",
      undo() { State.dependencies.push(dep); },
      redo() { State.dependencies = State.dependencies.filter(d => d.rid !== depRid); },
    });
    toast("Dependency removed", "success");
    if (_render) _render();
    if (_openQuickEdit && State.selectedRid) _openQuickEdit(State.selectedRid);
  } catch (err) {
    toast("Failed to delete dependency: " + err.message, "error");
  }
}
