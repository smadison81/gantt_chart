import State from '../state.js';
import { el } from '../utils/dom.js';
import { isMobile } from '../config.js';
import { applyFilters } from '../filters.js';

// _render injected indirectly via applyFilters; no direct hook needed

export function renderFilterBar(showCards = false) {
  const fb = document.getElementById("filterbar");
  if (!fb) return;
  fb.innerHTML = "";
  if (isMobile() && !fb.classList.contains("expanded")) fb.classList.remove("expanded");

  const search = el("input", {
    type: "text", class: "search", placeholder: "Search tasks...",
    value: State.filters.search,
    oninput: e => { State.filters.search = e.target.value; applyFilters(); }
  });
  fb.appendChild(search);

  const statuses = [...new Set(State.tasks.map(t => t.status).filter(Boolean))];
  if (statuses.length) {
    const sel = el("select", {
      onchange: e => { State.filters.status = e.target.value; applyFilters(); }
    });
    sel.appendChild(el("option", { value: "" }, ["All statuses"]));
    statuses.forEach(s => {
      const o = el("option", { value: s }, [s]);
      if (State.filters.status === s) o.selected = true;
      sel.appendChild(o);
    });
    fb.appendChild(sel);
  }

  if (State.resources.length) {
    const resSel = el("select", {
      onchange: e => { State.filters.resource = e.target.value; applyFilters(); }
    });
    resSel.appendChild(el("option", { value: "" }, ["All resources"]));
    State.resources.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(r => {
      const o = el("option", { value: String(r.rid) }, [r.name]);
      if (String(State.filters.resource) === String(r.rid)) o.selected = true;
      resSel.appendChild(o);
    });
    fb.appendChild(resSel);
  }

  const range = el("select", {
    onchange: e => { State.filters.range = e.target.value; applyFilters(); }
  });
  [["all", "All time"], ["30", "Next 30 days"], ["90", "Next 90 days"], ["180", "Next 6 months"], ["365", "Next year"]].forEach(([v, l]) => {
    const o = el("option", { value: v }, [l]);
    if (State.filters.range === v) o.selected = true;
    range.appendChild(o);
  });
  fb.appendChild(range);

  const lateLbl = el("label", { style: { fontSize: "12px", display: "flex", alignItems: "center", gap: "4px", color: "var(--text-2)" }});
  const lateChk = el("input", { type: "checkbox" });
  if (State.filters.showLate) lateChk.checked = true;
  lateChk.addEventListener("change", e => { State.filters.showLate = e.target.checked; applyFilters(); });
  lateLbl.appendChild(lateChk);
  lateLbl.appendChild(document.createTextNode(" Late only"));
  fb.appendChild(lateLbl);

  const msLbl = el("label", { style: { fontSize: "12px", display: "flex", alignItems: "center", gap: "4px", color: "var(--text-2)" }});
  const msChk = el("input", { type: "checkbox" });
  if (State.filters.showMilestones) msChk.checked = true;
  msChk.addEventListener("change", e => { State.filters.showMilestones = e.target.checked; applyFilters(); });
  msLbl.appendChild(msChk);
  msLbl.appendChild(document.createTextNode(" Milestones"));
  fb.appendChild(msLbl);

  if (State.cfg.fidBaselineStart) {
    const blLbl = el("label", { style: { fontSize: "12px", display: "flex", alignItems: "center", gap: "4px", color: "var(--text-2)" }});
    const blChk = el("input", { type: "checkbox" });
    if (State.showBaselines) blChk.checked = true;
    blChk.addEventListener("change", e => { State.showBaselines = e.target.checked; _renderFromParent(); });
    blLbl.appendChild(blChk);
    blLbl.appendChild(document.createTextNode(" Baseline"));
    fb.appendChild(blLbl);
  }

  if (State.dependencies.length) {
    const depLbl = el("label", { style: { fontSize: "12px", display: "flex", alignItems: "center", gap: "4px", color: "var(--text-2)" }});
    const depChk = el("input", { type: "checkbox" });
    if (State.showDeps) depChk.checked = true;
    depChk.addEventListener("change", e => { State.showDeps = e.target.checked; _renderFromParent(); });
    depLbl.appendChild(depChk);
    depLbl.appendChild(document.createTextNode(" Dependencies"));
    fb.appendChild(depLbl);

    const cascLbl = el("label", { style: { fontSize: "12px", display: "flex", alignItems: "center", gap: "4px", color: "var(--text-2)" }});
    const cascChk = el("input", { type: "checkbox" });
    if (State.cascadeOnMove) cascChk.checked = true;
    cascChk.addEventListener("change", e => { State.cascadeOnMove = e.target.checked; });
    cascLbl.appendChild(cascChk);
    cascLbl.appendChild(document.createTextNode(" Cascade"));
    fb.appendChild(cascLbl);
  }

  const lblLbl = el("label", { style: { fontSize: "12px", display: "flex", alignItems: "center", gap: "4px", color: "var(--text-2)" }});
  const lblChk = el("input", { type: "checkbox" });
  if (State.showLabels) lblChk.checked = true;
  lblChk.addEventListener("change", e => { State.showLabels = e.target.checked; _renderFromParent(); });
  lblLbl.appendChild(lblChk);
  lblLbl.appendChild(document.createTextNode(" Labels"));
  fb.appendChild(lblLbl);

  const legend = el("div", { class: "legend" });
  const legendItems = [
    { label: "Not Started", color: "#94a3b8" },
    { label: "In Progress", color: "var(--bar-progress)" },
    { label: "Complete",    color: "var(--bar-complete)" },
    { label: "Blocked",     color: "var(--bar-blocked)" },
    { label: "Late",        color: "var(--bar-late)" },
  ];
  legendItems.forEach(it => {
    const item = el("span", { class: "item" });
    item.appendChild(el("span", { class: "swatch", style: { background: it.color } }));
    item.appendChild(document.createTextNode(it.label));
    legend.appendChild(item);
  });
  const ms = el("span", { class: "item" });
  ms.appendChild(el("span", { class: "swatch milestone", style: { background: "var(--bar)" } }));
  ms.appendChild(document.createTextNode("Milestone"));
  legend.appendChild(ms);
  fb.appendChild(legend);
}

// The render function for toggle-driven re-renders (baselines, deps, labels)
let _renderFromParent = () => {};
export function setRenderRef(fn) {
  _renderFromParent = fn;
}

export function renderStatusBar() {
  // status bar content is updated dynamically by setStatus
}
