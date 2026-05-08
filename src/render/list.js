import State from '../state.js';
import { el } from '../utils/dom.js';
import { fmtUS } from '../utils/dates.js';
import { toast } from '../utils/notify.js';
import { updateRecords } from '../api.js';
import { buildColumnCSS } from './shell.js';
import { toggleTaskCollapse } from '../filters.js';
import { saveFieldValue } from '../tasks.js';
import { queueChange } from '../undo.js';
import { computeVisible } from '../filters.js';

// Injected by main.js
let _render = null;

export function injectHooks(render) {
  _render = render;
}

// Set by main.js
let _selectTask = null;
let _openQuickEdit = null;
let _showContextMenu = null;

export function setActionRefs(refs) {
  _selectTask = refs.selectTask;
  _openQuickEdit = refs.openQuickEdit;
  _showContextMenu = refs.showContextMenu;
}

let _dragRid = null;

export function renderList() {
  const lb = document.getElementById("list-body");
  if (!lb) return;
  lb.innerHTML = "";
  if (!State.visible.length) {
    lb.appendChild(el("div", { class: "empty" }, [
      el("div", { class: "ico" }, ["\uD83D\uDCCB"]),
      el("div", {}, ["No tasks to show."]),
      el("div", { style: { fontSize: "12px", color: "var(--text-3)" }}, ["Adjust filters or check field mapping."]),
    ]));
    return;
  }
  const canReorder = State.cfg.fidSortOrder && !State.cfg.readOnly && State.groupBy === "none";
  State.visible.forEach((item, idx) => {
    if (item.type === "group") {
      const collapsed = State.groups[item.key];
      const row = el("div", {
        class: "list-row group-header" + (collapsed ? " collapsed" : ""),
        onclick: () => { if (_selectTask) _selectTask(null); State.groups[item.key] = !State.groups[item.key]; computeVisible(); if (_render) _render(); }
      }, [
        el("div", { class: "gh" }, [
          el("span", { class: "chev" }, ["\u25BE"]),
          el("span", {}, [item.key]),
          el("span", { class: "gh-pill" }, [String(item.count)]),
        ]),
      ]);
      lb.appendChild(row);
    } else {
      const t = item.task;
      const sel = State.selectedRid === t.rid ? " selected" : "";
      const row = el("div", {
        class: "list-row" + sel,
        "data-rid": t.rid,
        onclick: () => { if (_selectTask) _selectTask(t.rid); },
        ondblclick: () => { if (_openQuickEdit) _openQuickEdit(t.rid); },
        oncontextmenu: e => { if (_showContextMenu) _showContextMenu(e, t); },
      });

      row.style.gridTemplateColumns = buildColumnCSS(State.columnOrder);

      const cellBuilders = {
        id: () => {
          const ridCell = el("div", { class: "rid", title: `Record #${t.rid}` });
          if (canReorder) {
            const grip = el("span", { class: "drag-grip", title: "Drag to reorder" }, ["\u2630"]);
            ridCell.appendChild(grip);
            ridCell.appendChild(document.createTextNode(" " + t.rid));
            row.draggable = true;
            attachRowDrag(row, t, idx);
          } else {
            ridCell.textContent = String(t.rid);
          }
          return ridCell;
        },
        name: () => {
          const nameCell = el("div", { class: "nm", title: t.name });
          if (State.cfg.fidParentTask && t.depth > 0) {
            nameCell.style.paddingLeft = (t.depth * 20) + "px";
          }
          if (t.isParent) {
            const chevron = el("button", {
              class: "chevron-btn" + (State.collapsedTasks[t.rid] ? " collapsed" : ""),
              onclick: e => { e.stopPropagation(); toggleTaskCollapse(t.rid); },
            }, ["\u25BC"]);
            nameCell.appendChild(chevron);
            nameCell.appendChild(document.createTextNode(" " + t.name));
          } else {
            nameCell.textContent = t.name;
          }
          nameCell.addEventListener("dblclick", e => {
            e.stopPropagation();
            if (State.cfg.readOnly) return;
            startInlineEdit(nameCell, t, "name");
          });
          return nameCell;
        },
        dates: () => {
          return el("div", { class: "dt", title: `${fmtUS(t.start)} \u2192 ${fmtUS(t.end)}` }, [
            el("div", {}, [fmtUS(t.start)]),
            el("div", {}, [fmtUS(t.end)]),
          ]);
        },
        status: () => {
          const statusCell = el("div", { class: "st", title: t.status || "" }, [t.status || ""]);
          statusCell.addEventListener("dblclick", e => {
            e.stopPropagation();
            if (State.cfg.readOnly || !State.cfg.fidStatus) return;
            startInlineEdit(statusCell, t, "status");
          });
          return statusCell;
        },
      };

      State.columnOrder.forEach(colId => {
        const builder = cellBuilders[colId];
        if (builder) row.appendChild(builder());
      });

      lb.appendChild(row);
    }
  });
}

function startInlineEdit(cell, task, field) {
  const { cfg } = State;
  let input;

  if (field === "name") {
    input = el("input", { type: "text", class: "inline-input", value: task.name });
    const finish = (save) => {
      if (save && input.value !== task.name) {
        task.name = input.value;
        saveFieldValue(task, cfg.fidName, input.value, "Name");
      }
      if (_render) _render();
    };
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  } else if (field === "status") {
    const statuses = [...new Set(State.tasks.map(x => x.status).filter(Boolean))];
    input = el("select", { class: "inline-input" });
    input.appendChild(el("option", { value: "" }, [""]));
    statuses.forEach(s => {
      const o = el("option", { value: s }, [s]);
      if (s === task.status) o.selected = true;
      input.appendChild(o);
    });
    const finish = (save) => {
      if (save && input.value !== task.status) {
        task.status = input.value;
        saveFieldValue(task, cfg.fidStatus, input.value, "Status");
      }
      if (_render) _render();
    };
    input.addEventListener("change", () => finish(true));
    input.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  }

  if (input) {
    cell.textContent = "";
    cell.appendChild(input);
    input.focus();
    if (input.select) input.select();
  }
}

function attachRowDrag(row, task, idx) {
  row.addEventListener("dragstart", e => {
    _dragRid = task.rid;
    e.dataTransfer.effectAllowed = "move";
    row.style.opacity = "0.5";
  });
  row.addEventListener("dragend", () => {
    _dragRid = null;
    row.style.opacity = "";
    document.querySelectorAll(".list-row.drag-over").forEach(r => r.classList.remove("drag-over"));
  });
  row.addEventListener("dragover", e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    row.classList.add("drag-over");
  });
  row.addEventListener("dragleave", () => {
    row.classList.remove("drag-over");
  });
  row.addEventListener("drop", e => {
    e.preventDefault();
    row.classList.remove("drag-over");
    if (!_dragRid || _dragRid === task.rid) return;
    dropRow(_dragRid, task.rid);
  });
}

async function dropRow(draggedRid, targetRid) {
  const { cfg } = State;
  const list = State.visible.filter(v => v.type === "task").map(v => v.task);
  const dragIdx = list.findIndex(t => t.rid === draggedRid);
  const targetIdx = list.findIndex(t => t.rid === targetRid);
  if (dragIdx < 0 || targetIdx < 0) return;

  const [moved] = list.splice(dragIdx, 1);
  list.splice(targetIdx, 0, moved);

  const updates = [];
  list.forEach((t, i) => {
    const newOrder = (i + 1) * 10;
    if (t.sortOrder !== newOrder) {
      t.sortOrder = newOrder;
      updates.push({ [3]: { value: t.rid }, [cfg.fidSortOrder]: { value: newOrder } });
    }
  });

  computeVisible();
  if (_render) _render();

  if (updates.length && cfg.autoSave) {
    try {
      await updateRecords(cfg.taskDbid, updates, [3]);
      toast("Reordered", "success");
    } catch (err) {
      toast("Reorder save failed: " + err.message, "error");
    }
  } else if (updates.length) {
    updates.forEach(u => {
      const rid = u[3].value;
      queueChange(rid, cfg.fidSortOrder, 0, u[cfg.fidSortOrder].value);
    });
    toast("Reorder queued", "info");
  }
}
