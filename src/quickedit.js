import State from './state.js';
import { el } from './utils/dom.js';
import { fmtISO, fmtUS, diffDays, parseDate } from './utils/dates.js';
import { toast, setStatus } from './utils/notify.js';
import { updateRecords } from './api.js';
import { isMobile } from './config.js';
import { computeChartWindow } from './chart.js';
import { deleteDependency, createDependency } from './interactions/dep-draw.js';
import { deleteTask } from './tasks.js';
import { allocationsForTask, resourceById, createAllocation, deleteAllocation, initials } from './allocations.js';

let _render = null;
export function injectHooks(render) { _render = render; }

let _applyFilters = null;
export function setApplyFiltersRef(fn) { _applyFilters = fn; }

// Persisted across drawer opens (session lifetime)
const _sectionOpen = {
  details: true,
  status: true,
  resources: false,
  dependencies: false,
  activity: false,
};

export function openQuickEdit(rid) {
  const t = State.tasks.find(x => x.rid === rid);
  if (!t) return;
  State.selectedRid = rid;
  const sp = document.getElementById("side-panel");
  sp.innerHTML = "";

  const head = el("div", { class: "ph" }, [
    el("div", { class: "ph-title" }, [
      el("h3", {}, [t.name || "Untitled"]),
      el("div", { class: "ph-sub" }, [`Record #${t.rid}`]),
    ]),
    el("button", { class: "btn ghost", onclick: closeQuickEdit, title: "Close (Esc)" }, ["✕"]),
  ]);

  const body = el("div", { class: "pb" });

  body.appendChild(buildDetailsCard(t));
  body.appendChild(buildStatusCard(t));
  if (State.cfg.allocDbid && State.cfg.resourceDbid) body.appendChild(buildResourcesCard(t));
  if (State.cfg.depDbid) body.appendChild(buildDepsCard(t));
  body.appendChild(buildActivityCard(t));

  const footChildren = [];
  if (!State.cfg.readOnly) {
    footChildren.push(el("button", { class: "btn danger", onclick: () => deleteTask(t.rid) }, ["Delete"]));
  }
  footChildren.push(el("button", { class: "btn", onclick: () => { window.open(buildRecordUrl(t.rid), "_blank"); }}, ["Open Record"]));
  footChildren.push(el("div", { style: { flex: "1" }}));
  footChildren.push(el("button", { class: "btn ghost", onclick: closeQuickEdit }, ["Cancel"]));
  if (!State.cfg.readOnly) {
    footChildren.push(el("button", { class: "btn primary", onclick: () => saveQuickEdit(t) }, ["Save Task"]));
  }
  const foot = el("div", { class: "pf" }, footChildren);

  sp.appendChild(head);
  sp.appendChild(body);
  sp.appendChild(foot);
  sp.classList.add("open");
  if (isMobile()) document.body.style.overflow = "hidden";
}

function renderCard(id, title, opts, content) {
  const { count = null, sub = "" } = opts || {};
  const open = _sectionOpen[id] !== false;
  const card = el("div", { class: "qe-card" + (open ? " open" : "") });

  const headChildren = [
    el("span", { class: "qe-card-title" }, [title]),
  ];
  if (count !== null && count !== undefined) {
    headChildren.push(el("span", { class: "qe-card-count" }, [String(count)]));
  }
  headChildren.push(el("span", { class: "qe-card-spacer" }));
  headChildren.push(el("span", { class: "qe-card-chev" }, [open ? "▾" : "▸"]));

  const head = el("button", { class: "qe-card-head", type: "button", onclick: () => {
    _sectionOpen[id] = !open;
    if (State.selectedRid != null) openQuickEdit(State.selectedRid);
  }}, headChildren);

  const bodyEl = el("div", { class: "qe-card-body" });
  if (sub) bodyEl.appendChild(el("div", { class: "qe-card-sub" }, [sub]));
  if (typeof content === "function") {
    const out = content();
    if (Array.isArray(out)) out.forEach(n => n && bodyEl.appendChild(n));
    else if (out) bodyEl.appendChild(out);
  } else if (Array.isArray(content)) {
    content.forEach(n => n && bodyEl.appendChild(n));
  } else if (content) {
    bodyEl.appendChild(content);
  }

  card.appendChild(head);
  if (open) card.appendChild(bodyEl);
  return card;
}

function buildDetailsCard(t) {
  return renderCard("details", "Details", {}, () => {
    const items = [];
    items.push(field({
      label: "Name", type: "text", value: t.name,
      help: "Display name shown on bars and in the task list",
      onChange: v => t._editName = v,
      readonly: State.cfg.readOnly,
    }));

    const startInp = field({
      label: "Start Date", type: "date", value: fmtISO(t.start),
      help: "First day of work",
      onChange: v => t._editStart = v,
      readonly: State.cfg.readOnly,
    });
    const endInp = field({
      label: "End Date", type: "date", value: fmtISO(t.end),
      help: "Last day of work, inclusive",
      onChange: v => t._editEnd = v,
      readonly: State.cfg.readOnly,
    });
    items.push(el("div", { class: "qe-row2" }, [startInp, endInp]));

    if (State.cfg.fidGroup) {
      items.push(field({
        label: "Group", type: "text", value: t.group,
        help: "Used for grouping rows in the list",
        onChange: v => t._editGroup = v,
        readonly: State.cfg.readOnly,
      }));
    }
    if (State.cfg.fidAssigned) {
      items.push(field({
        label: "Assigned To (legacy)", type: "text", value: t.assigned,
        help: "Free-text assignment. Use the Resources section for tracked assignment.",
        onChange: v => t._editAssigned = v,
        readonly: State.cfg.readOnly,
      }));
    }
    if (State.cfg.fidPriority && t.priority) {
      items.push(field({
        label: "Priority", type: "text", value: t.priority,
        help: "Used for sorting and visual emphasis",
        onChange: v => t._editPriority = v,
        readonly: true,
      }));
    }
    return items;
  });
}

function buildStatusCard(t) {
  if (!State.cfg.fidStatus && !State.cfg.fidPercent) return el("span");
  return renderCard("status", "Status & Progress", {}, () => {
    const items = [];
    if (State.cfg.fidStatus) {
      const statuses = [...new Set(State.tasks.map(x => x.status).filter(Boolean))];
      items.push(field({
        label: "Status", type: "select", value: t.status,
        options: statuses,
        help: "Current state of the task",
        onChange: v => t._editStatus = v,
        readonly: State.cfg.readOnly,
      }));
    }
    if (State.cfg.fidPercent) {
      const wrap = el("div", { class: "fld" });
      wrap.appendChild(el("label", {}, [
        el("span", {}, ["% Complete"]),
        el("span", { class: "fld-value" }, [`${Math.round(t.percent || 0)}%`]),
      ]));
      const inp = el("input", {
        type: "range", min: "0", max: "100", step: "5",
        value: String(t.percent || 0),
      });
      const bar = el("div", { class: "qe-progress" }, [
        el("div", { class: "qe-progress-fill", style: { width: `${t.percent || 0}%` }}),
      ]);
      const help = el("div", { class: "fld-help" }, ["Progress shown as fill on the bar"]);
      inp.addEventListener("input", e => {
        const v = Number(e.target.value);
        t._editPercent = v;
        bar.firstChild.style.width = v + "%";
        wrap.querySelector(".fld-value").textContent = v + "%";
      });
      if (State.cfg.readOnly) inp.disabled = true;
      wrap.appendChild(bar);
      wrap.appendChild(inp);
      wrap.appendChild(help);
      items.push(wrap);
    }
    return items;
  });
}

function buildResourcesCard(t) {
  const allocs = allocationsForTask(t.rid);
  return renderCard("resources", "Resources", { count: allocs.length, sub: "People assigned to this task" }, () => {
    const items = [];
    if (allocs.length) {
      allocs.forEach(a => {
        const r = resourceById(a.resourceRid);
        const name = r ? r.name : `Resource #${a.resourceRid}`;
        const type = r && r.type ? r.type : "";
        items.push(el("div", { class: "qe-listitem" }, [
          el("span", { class: "qe-avatar" }, [initials(name)]),
          el("div", { class: "qe-listitem-main" }, [
            el("div", { class: "qe-listitem-name", title: name }, [name]),
            type ? el("div", { class: "qe-listitem-meta" }, [type]) : null,
          ].filter(Boolean)),
          State.cfg.readOnly ? null : el("button", {
            class: "qe-listitem-del", title: "Remove",
            onclick: () => deleteAllocation(a.rid),
          }, ["×"]),
        ].filter(Boolean)));
      });
    } else {
      items.push(el("div", { class: "qe-empty" }, ["No resources assigned"]));
    }

    if (!State.cfg.readOnly) {
      const assignedIds = new Set(allocs.map(a => a.resourceRid));
      const available = State.resources.filter(r => !assignedIds.has(r.rid))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (available.length) {
        const resSelect = el("select");
        resSelect.appendChild(el("option", { value: "" }, ["Select resource..."]));
        available.forEach(r => {
          const lbl = r.type ? `${r.name} (${r.type})` : r.name;
          resSelect.appendChild(el("option", { value: String(r.rid) }, [lbl]));
        });
        const addBtn = el("button", { class: "btn primary", onclick: () => {
          const rid = Number(resSelect.value);
          if (!rid) { toast("Select a resource first", "error"); return; }
          createAllocation(t.rid, rid);
        }}, ["Add"]);
        const addRow = el("div", { class: "qe-add-row" }, [resSelect, addBtn]);
        items.push(addRow);
      } else if (allocs.length && State.resources.length) {
        items.push(el("div", { class: "qe-empty" }, ["All resources already assigned"]));
      }
    }
    return items;
  });
}

function buildDepsCard(t) {
  const preds = State.dependencies.filter(d => d.succ === t.rid);
  const succs = State.dependencies.filter(d => d.pred === t.rid);
  const total = preds.length + succs.length;
  return renderCard("dependencies", "Dependencies", { count: total, sub: "Tasks that must finish before, or come after, this one" }, () => {
    const items = [];
    if (preds.length) {
      items.push(el("div", { class: "qe-sublabel" }, ["Predecessors"]));
      preds.forEach(d => {
        const predTask = State.tasks.find(x => x.rid === d.pred);
        const name = predTask ? predTask.name : `RID ${d.pred}`;
        items.push(el("div", { class: "qe-listitem" }, [
          el("span", { class: "qe-pill" }, [d.type || "FS"]),
          el("div", { class: "qe-listitem-main" }, [
            el("div", { class: "qe-listitem-name", title: name }, [name]),
            d.lag ? el("div", { class: "qe-listitem-meta" }, [`+${d.lag}d lag`]) : null,
          ].filter(Boolean)),
          State.cfg.readOnly ? null : el("button", {
            class: "qe-listitem-del", title: "Remove",
            onclick: () => deleteDependency(d.rid),
          }, ["×"]),
        ].filter(Boolean)));
      });
    }
    if (succs.length) {
      items.push(el("div", { class: "qe-sublabel", style: { marginTop: "10px" }}, ["Successors"]));
      succs.forEach(d => {
        const succTask = State.tasks.find(x => x.rid === d.succ);
        const name = succTask ? succTask.name : `RID ${d.succ}`;
        items.push(el("div", { class: "qe-listitem" }, [
          el("span", { class: "qe-pill" }, [d.type || "FS"]),
          el("div", { class: "qe-listitem-main" }, [
            el("div", { class: "qe-listitem-name", title: name }, [name]),
            d.lag ? el("div", { class: "qe-listitem-meta" }, [`+${d.lag}d lag`]) : null,
          ].filter(Boolean)),
          State.cfg.readOnly ? null : el("button", {
            class: "qe-listitem-del", title: "Remove",
            onclick: () => deleteDependency(d.rid),
          }, ["×"]),
        ].filter(Boolean)));
      });
    }
    if (!total) items.push(el("div", { class: "qe-empty" }, ["No dependencies yet"]));

    if (!State.cfg.readOnly) {
      const otherTasks = State.tasks.filter(x => x.rid !== t.rid).sort((a, b) => a.name.localeCompare(b.name));
      const taskSelect = el("select");
      taskSelect.appendChild(el("option", { value: "" }, ["Select task..."]));
      otherTasks.forEach(ot => taskSelect.appendChild(el("option", { value: String(ot.rid) }, [`${ot.name} (#${ot.rid})`])));
      const dirSelect = el("select");
      dirSelect.appendChild(el("option", { value: "pred" }, ["is predecessor"]));
      dirSelect.appendChild(el("option", { value: "succ" }, ["is successor"]));
      const typeSelect = el("select");
      ["FS", "SS", "FF", "SF"].forEach(tp => typeSelect.appendChild(el("option", { value: tp }, [tp])));
      const lagInput = el("input", { type: "number", value: "0", min: "0", title: "Lag (days)" });
      lagInput.style.width = "60px";
      const addBtn = el("button", { class: "btn primary", onclick: () => {
        const otherRid = Number(taskSelect.value);
        if (!otherRid) { toast("Select a task first", "error"); return; }
        const type = typeSelect.value;
        const lag = Number(lagInput.value) || 0;
        if (dirSelect.value === "pred") createDependency(otherRid, t.rid, type, lag);
        else createDependency(t.rid, otherRid, type, lag);
      }}, ["Add"]);

      items.push(el("div", { class: "qe-sublabel", style: { marginTop: "12px" }}, ["Add Dependency"]));
      items.push(el("div", { class: "qe-add-row" }, [taskSelect, dirSelect]));
      items.push(el("div", { class: "qe-add-row" }, [
        el("span", { class: "qe-inline-label" }, ["Type"]),
        typeSelect,
        el("span", { class: "qe-inline-label" }, ["Lag"]),
        lagInput,
        addBtn,
      ]));
    }
    return items;
  });
}

function buildActivityCard(t) {
  return renderCard("activity", "Activity", { sub: "Read-only metadata" }, () => {
    const items = [];
    const dur = (t.start && t.end) ? diffDays(t.start, t.end) + 1 : 0;
    items.push(metaRow("Record ID", `#${t.rid}`));
    items.push(metaRow("Duration", `${dur} day${dur === 1 ? "" : "s"}`));
    if (t.start) items.push(metaRow("Window", `${fmtUS(t.start)} → ${fmtUS(t.end)}`));
    if (t.baselineStart && t.baselineEnd) {
      items.push(metaRow("Baseline", `${fmtUS(t.baselineStart)} → ${fmtUS(t.baselineEnd)}`));
    }
    if (t.wbs) items.push(metaRow("WBS", t.wbs));
    if (t.parentRid) items.push(metaRow("Parent task", `#${t.parentRid}`));
    return items;
  });
}

function metaRow(label, value) {
  return el("div", { class: "qe-meta" }, [
    el("div", { class: "qe-meta-k" }, [label]),
    el("div", { class: "qe-meta-v" }, [value]),
  ]);
}

function field({ label, type, value, onChange, options = [], help = "", readonly = false }) {
  const wrap = el("div", { class: "fld" });
  wrap.appendChild(el("label", {}, [label]));
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
    input.value = value == null ? "" : String(value);
  } else {
    input = el("input", { type, value: value == null ? "" : String(value) });
  }
  if (readonly) input.disabled = true;
  if (onChange && !readonly) {
    input.addEventListener("change", e => onChange(e.target.value));
    input.addEventListener("input", e => onChange(e.target.value));
  }
  wrap.appendChild(input);
  if (help) wrap.appendChild(el("div", { class: "fld-help" }, [help]));
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
  if (task._editStart !== undefined) data[startSaveFid] = { value: task._editStart };
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
