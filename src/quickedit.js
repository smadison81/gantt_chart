import State from './state.js';
import { el } from './utils/dom.js';
import { fmtISO, fmtUS, diffDays, parseDate } from './utils/dates.js';
import { toast, setStatus } from './utils/notify.js';
import { updateRecords } from './api.js';
import { isMobile } from './config.js';
import { computeChartWindow } from './chart.js';
import { deleteDependency, createDependency } from './interactions/dep-draw.js';
import { deleteTask } from './tasks.js';

// Injected by main.js
let _render = null;

export function injectHooks(render) {
  _render = render;
}

// applyFilters injected to avoid circular
let _applyFilters = null;
export function setApplyFiltersRef(fn) {
  _applyFilters = fn;
}

export function openQuickEdit(rid) {
  const t = State.tasks.find(x => x.rid === rid);
  if (!t) return;
  State.selectedRid = rid;
  const sp = document.getElementById("side-panel");
  sp.innerHTML = "";

  const head = el("div", { class: "ph" }, [
    el("h3", {}, [t.name]),
    el("button", { class: "btn ghost", onclick: closeQuickEdit }, ["\u2715"]),
  ]);

  const body = el("div", { class: "pb" });

  const nameField = renderField("Name", "text", t.name, v => t._editName = v);
  const startField = renderField("Start Date", "date", fmtISO(t.start), v => t._editStart = v);
  const endField = renderField("End Date", "date", fmtISO(t.end), v => t._editEnd = v);
  const dates = el("div", { class: "row2" }, [startField, endField]);
  body.appendChild(nameField);
  body.appendChild(dates);

  if (State.cfg.fidStatus) {
    const statuses = [...new Set(State.tasks.map(x => x.status).filter(Boolean))];
    body.appendChild(renderField("Status", "select", t.status, v => t._editStatus = v, statuses));
  }
  if (State.cfg.fidPercent) {
    body.appendChild(renderField("% Complete", "number", t.percent, v => t._editPercent = v));
  }
  if (State.cfg.fidAssigned) {
    body.appendChild(renderField("Assigned To", "text", t.assigned, v => t._editAssigned = v));
  }
  if (State.cfg.fidGroup) {
    body.appendChild(renderField("Group", "text", t.group, v => t._editGroup = v));
  }

  body.appendChild(el("div", { class: "fld" }, [
    el("label", {}, ["Quick Info"]),
    el("div", { style: { fontSize: "12px", color: "var(--text-2)", lineHeight: "1.6" }}, [
      el("div", {}, [`Record ID: ${t.rid}`]),
      el("div", {}, [`Duration: ${diffDays(t.start, t.end) + 1} day${diffDays(t.start, t.end) === 0 ? "" : "s"}`]),
      t.baselineStart ? el("div", {}, [`Baseline: ${fmtUS(t.baselineStart)} \u2192 ${fmtUS(t.baselineEnd)}`]) : null,
    ].filter(Boolean)),
  ]));

  // Dependencies section
  if (State.cfg.depDbid && !State.cfg.readOnly) {
    const depSec = el("div", { class: "dep-section" });
    depSec.appendChild(el("h4", {}, ["Dependencies"]));

    const preds = State.dependencies.filter(d => d.succ === t.rid);
    const succs = State.dependencies.filter(d => d.pred === t.rid);

    if (preds.length) {
      depSec.appendChild(el("label", { style: { fontSize: "11px", color: "var(--text-3)", fontWeight: "600", display: "block", marginBottom: "4px" }}, ["Predecessors"]));
      preds.forEach(d => {
        const predTask = State.tasks.find(x => x.rid === d.pred);
        depSec.appendChild(el("div", { class: "dep-item" }, [
          el("span", { class: "dep-type" }, [d.type || "FS"]),
          el("span", { class: "dep-name", title: predTask ? predTask.name : `RID ${d.pred}` }, [predTask ? predTask.name : `RID ${d.pred}`]),
          d.lag ? el("span", { class: "dep-lag" }, [`+${d.lag}d`]) : null,
          el("button", { class: "dep-del", title: "Remove", onclick: () => deleteDependency(d.rid) }, ["\u00d7"]),
        ].filter(Boolean)));
      });
    }

    if (succs.length) {
      depSec.appendChild(el("label", { style: { fontSize: "11px", color: "var(--text-3)", fontWeight: "600", display: "block", marginBottom: "4px", marginTop: preds.length ? "8px" : "0" }}, ["Successors"]));
      succs.forEach(d => {
        const succTask = State.tasks.find(x => x.rid === d.succ);
        depSec.appendChild(el("div", { class: "dep-item" }, [
          el("span", { class: "dep-type" }, [d.type || "FS"]),
          el("span", { class: "dep-name", title: succTask ? succTask.name : `RID ${d.succ}` }, [succTask ? succTask.name : `RID ${d.succ}`]),
          d.lag ? el("span", { class: "dep-lag" }, [`+${d.lag}d`]) : null,
          el("button", { class: "dep-del", title: "Remove", onclick: () => deleteDependency(d.rid) }, ["\u00d7"]),
        ].filter(Boolean)));
      });
    }

    if (!preds.length && !succs.length) {
      depSec.appendChild(el("div", { style: { fontSize: "12px", color: "var(--text-3)", marginBottom: "8px" }}, ["No dependencies yet"]));
    }

    // Add new dependency form
    const otherTasks = State.tasks.filter(x => x.rid !== t.rid).sort((a, b) => a.name.localeCompare(b.name));
    depSec.appendChild(el("label", { style: { fontSize: "11px", color: "var(--text-3)", fontWeight: "600", display: "block", marginTop: "12px", marginBottom: "4px" }}, ["Add Dependency"]));

    const taskSelect = el("select");
    taskSelect.appendChild(el("option", { value: "" }, ["Select task..."]));
    otherTasks.forEach(ot => {
      taskSelect.appendChild(el("option", { value: String(ot.rid) }, [`${ot.name} (#${ot.rid})`]));
    });

    const typeSelect = el("select");
    ["FS", "SS", "FF", "SF"].forEach(tp => {
      typeSelect.appendChild(el("option", { value: tp }, [tp]));
    });

    const lagInput = el("input", { type: "number", value: "0", min: "0", placeholder: "Lag", title: "Lag (days)" });

    const dirSelect = el("select");
    dirSelect.appendChild(el("option", { value: "pred" }, ["is predecessor"]));
    dirSelect.appendChild(el("option", { value: "succ" }, ["is successor"]));

    const addBtn = el("button", { class: "btn primary", onclick: () => {
      const otherRid = Number(taskSelect.value);
      if (!otherRid) { toast("Select a task first", "error"); return; }
      const type = typeSelect.value;
      const lag = Number(lagInput.value) || 0;
      if (dirSelect.value === "pred") {
        createDependency(otherRid, t.rid, type, lag);
      } else {
        createDependency(t.rid, otherRid, type, lag);
      }
    }}, ["Add"]);

    const addRow = el("div", { style: { display: "flex", flexDirection: "column", gap: "6px" }});
    const topRow = el("div", { style: { display: "flex", gap: "6px" }}, [taskSelect, dirSelect]);
    const bottomRow = el("div", { style: { display: "flex", gap: "6px", alignItems: "center" }}, [
      el("span", { style: { fontSize: "12px", color: "var(--text-2)" }}, ["Type:"]),
      typeSelect,
      el("span", { style: { fontSize: "12px", color: "var(--text-2)" }}, ["Lag:"]),
      lagInput,
      addBtn,
    ]);
    taskSelect.style.flex = "1";
    taskSelect.style.minWidth = "0";
    addRow.appendChild(topRow);
    addRow.appendChild(bottomRow);
    depSec.appendChild(addRow);

    body.appendChild(depSec);
  }

  const footChildren = [];
  if (!State.cfg.readOnly) {
    footChildren.push(el("button", { class: "btn danger", onclick: () => deleteTask(t.rid) }, ["Delete"]));
  }
  footChildren.push(el("button", { class: "btn", onclick: () => { window.open(buildRecordUrl(t.rid), "_blank"); }}, ["Open Record"]));
  footChildren.push(el("div", { style: { flex: "1" }}));
  footChildren.push(el("button", { class: "btn ghost", onclick: closeQuickEdit }, ["Cancel"]));
  footChildren.push(el("button", { class: "btn primary", onclick: () => saveQuickEdit(t) }, ["Save"]));
  const foot = el("div", { class: "pf" }, footChildren);

  sp.appendChild(head);
  sp.appendChild(body);
  sp.appendChild(foot);
  sp.classList.add("open");
  if (isMobile()) document.body.style.overflow = "hidden";
}

function renderField(label, type, value, onChange, options = []) {
  const wrap = el("div", { class: "fld" }, [
    el("label", {}, [label]),
  ]);
  let input;
  if (type === "select") {
    input = el("select");
    input.appendChild(el("option", { value: "" }, [""]));
    options.forEach(o => {
      const op = el("option", { value: o }, [o]);
      if (o === value) op.selected = true;
      input.appendChild(op);
    });
  } else if (type === "textarea") {
    input = el("textarea", { rows: "3" });
    input.value = value || "";
  } else {
    input = el("input", { type, value: value || "" });
  }
  input.addEventListener("change", e => onChange(e.target.value));
  input.addEventListener("input", e => onChange(e.target.value));
  wrap.appendChild(input);
  return wrap;
}

export function closeQuickEdit() {
  const sp = document.getElementById("side-panel");
  sp.classList.remove("open");
  State.selectedRid = null;
  document.body.style.overflow = "";
  if (_render) _render();
}

async function saveQuickEdit(task) {
  const { cfg } = State;
  const startSaveFid = cfg.fidStartSave || cfg.fidStart;
  const data = { [3]: { value: task.rid } };
  if (task._editName !== undefined && cfg.fidName) data[cfg.fidName] = { value: task._editName };
  if (task._editStart !== undefined) {
    data[startSaveFid] = { value: task._editStart };
  }
  if (task._editEnd !== undefined && cfg.fidEnd) data[cfg.fidEnd] = { value: task._editEnd };
  if (task._editStatus !== undefined && cfg.fidStatus) data[cfg.fidStatus] = { value: task._editStatus };
  if (task._editPercent !== undefined && cfg.fidPercent) data[cfg.fidPercent] = { value: Number(task._editPercent) };
  if (task._editAssigned !== undefined && cfg.fidAssigned) data[cfg.fidAssigned] = { value: task._editAssigned };
  if (task._editGroup !== undefined && cfg.fidGroup) data[cfg.fidGroup] = { value: task._editGroup };
  try {
    setStatus("Saving...", "info");
    await updateRecords(cfg.taskDbid, [data], [3]);
    if (task._editName !== undefined) task.name = task._editName;
    if (task._editStart !== undefined) task.start = parseDate(task._editStart) || task.start;
    if (task._editEnd !== undefined) task.end = parseDate(task._editEnd) || task.end;
    if (task._editStatus !== undefined) task.status = task._editStatus;
    if (task._editPercent !== undefined) task.percent = Number(task._editPercent);
    if (task._editAssigned !== undefined) task.assigned = task._editAssigned;
    if (task._editGroup !== undefined) task.group = task._editGroup;
    closeQuickEdit();
    computeChartWindow();
    if (_applyFilters) _applyFilters();
    toast("Saved", "success");
  } catch (err) {
    toast("Save failed: " + err.message, "error");
  }
}

export function buildRecordUrl(rid) {
  return `https://${State.realm}/db/${State.cfg.taskDbid}?a=er&rid=${rid}`;
}
