import State from '../state.js';
import { el } from '../utils/dom.js';
import { getNumParam, isMobile } from '../config.js';
import { createTask } from '../tasks.js';
import { persistSettings } from '../persist.js';

// Injected by main.js
let _render = null;

export function injectHooks(render) {
  _render = render;
}

export const COL_DEFS = {
  id:     { label: "ID",     resize: false },
  name:   { label: "Name",   resize: true, resizeCol: "name"   },
  dates:  { label: "Dates",  resize: true, resizeCol: "dates"  },
  status: { label: "Status", resize: false },
};

export function buildColumnCSS(order) {
  const widths = order.map(c => {
    if (c === "id") return "50px";
    if (c === "name") return "var(--col-name,1fr)";
    if (c === "dates") return "var(--col-dates,100px)";
    if (c === "status") return "var(--col-status,90px)";
    return "1fr";
  });
  return widths.join(" ");
}

export function renderListHead() {
  const head = document.getElementById("list-head");
  if (!head) return;
  head.innerHTML = "";
  head.style.gridTemplateColumns = buildColumnCSS(State.columnOrder);

  State.columnOrder.forEach(colId => {
    const def = COL_DEFS[colId];
    const hdr = el("div", { draggable: "true", "data-colid": colId, style: { cursor: "grab" }}, [def.label]);
    if (def.resize) {
      hdr.appendChild(el("div", { class: "col-resize", "data-col": def.resizeCol, title: "Drag to resize" }));
    }
    hdr.addEventListener("dragstart", e => {
      e.dataTransfer.setData("text/plain", colId);
      e.dataTransfer.effectAllowed = "move";
      hdr.style.opacity = "0.5";
    });
    hdr.addEventListener("dragend", () => { hdr.style.opacity = ""; });
    hdr.addEventListener("dragover", e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      hdr.style.borderLeft = "2px solid var(--accent)";
    });
    hdr.addEventListener("dragleave", () => { hdr.style.borderLeft = ""; });
    hdr.addEventListener("drop", e => {
      e.preventDefault();
      hdr.style.borderLeft = "";
      const from = e.dataTransfer.getData("text/plain");
      if (from === colId) return;
      const arr = [...State.columnOrder];
      const fi = arr.indexOf(from);
      const ti = arr.indexOf(colId);
      if (fi < 0 || ti < 0) return;
      arr.splice(fi, 1);
      arr.splice(ti, 0, from);
      State.columnOrder = arr;
      renderListHead();
      if (_render) _render();
      persistSettings();
    });
    head.appendChild(hdr);
  });
}

export function renderShell() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="toolbar" id="toolbar"></div>
    <div class="filterbar" id="filterbar"></div>
    <div class="statusbar" id="statusbar"></div>
    <div class="main" id="main">
      <div class="left">
        <div class="list-head" id="list-head"></div>
        <div class="list-body" id="list-body"></div>
      </div>
      <div class="divider-cell" id="panel-divider" title="Drag to resize panel"></div>
      <div class="right">
        <div class="timeline-head" id="timeline-head">
          <div class="timeline-head-inner" id="timeline-head-inner"></div>
        </div>
        <div class="timeline-scroll" id="timeline-scroll">
          <div class="timeline-inner" id="timeline-inner"></div>
        </div>
      </div>
    </div>
    <div class="side-panel" id="side-panel"></div>
    <div class="mobile-cards" id="mobile-cards" style="display:none"></div>
    <div class="overflow-backdrop" id="overflow-backdrop"></div>
    <div class="overflow-panel" id="overflow-panel"></div>
  `;
  if (!State.cfg.readOnly) {
    const fab = document.createElement("button");
    fab.className = "fab";
    fab.id = "mobile-fab";
    fab.style.display = "none";
    fab.textContent = "+";
    fab.addEventListener("click", () => createTask());
    document.getElementById("app").appendChild(fab);
  }
  let resizeTimer;
  let wasMobile = isMobile();
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const nowMobile = isMobile();
      if (nowMobile !== wasMobile) { wasMobile = nowMobile; if (_render) _render(); }
    }, 150);
  });
  const root = document.documentElement;
  const savedLeft = getNumParam("leftw", 0);
  const savedColName = getNumParam("colname", 0);
  const savedColDates = getNumParam("coldates", 0);
  if (savedLeft) root.style.setProperty("--left-w", savedLeft + "px");
  if (savedColName) root.style.setProperty("--col-name", savedColName + "px");
  if (savedColDates) root.style.setProperty("--col-dates", savedColDates + "px");
  renderListHead();
  attachLayoutResizers();
}

export function attachLayoutResizers() {
  const divider = document.getElementById("panel-divider");
  if (divider) {
    divider.addEventListener("pointerdown", e => {
      e.preventDefault();
      divider.classList.add("dragging");
      divider.setPointerCapture(e.pointerId);
      const startX = e.clientX;
      const startW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--left-w")) || 440;

      const onMove = ev => {
        const dx = ev.clientX - startX;
        const w = Math.max(220, Math.min(900, startW + dx));
        document.documentElement.style.setProperty("--left-w", w + "px");
      };
      const onUp = () => {
        divider.classList.remove("dragging");
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        if (_render) _render();
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
  }

  document.querySelectorAll(".col-resize").forEach(handle => {
    handle.addEventListener("pointerdown", e => {
      e.preventDefault();
      e.stopPropagation();
      const col = handle.dataset.col;
      const cssVar = col === "name" ? "--col-name" : "--col-dates";
      const startX = e.clientX;
      const headCells = document.querySelectorAll(".list-head > div");
      const cellIdx = col === "name" ? 1 : 2;
      const startW = headCells[cellIdx] ? headCells[cellIdx].getBoundingClientRect().width : 200;

      handle.setPointerCapture(e.pointerId);
      const onMove = ev => {
        const dx = ev.clientX - startX;
        const w = Math.max(60, Math.min(600, startW + dx));
        document.documentElement.style.setProperty(cssVar, w + "px");
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });
  });
}
