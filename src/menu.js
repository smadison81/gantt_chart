import { el } from './utils/dom.js';
import State from './state.js';
import { createTask } from './tasks.js';

// Set by main.js
let _openQuickEdit = null;
let _deleteTask = null;

export function setActionRefs(refs) {
  _openQuickEdit = refs.openQuickEdit;
  _deleteTask = refs.deleteTask;
}

export function dismissContextMenu() {
  const old = document.querySelector(".ctx-menu");
  if (old) old.remove();
}

export function showContextMenu(e, task) {
  e.preventDefault();
  e.stopPropagation();
  dismissContextMenu();

  const menu = el("div", { class: "ctx-menu" });
  menu.appendChild(el("button", { class: "ctx-item", onclick: () => { dismissContextMenu(); if (_openQuickEdit) _openQuickEdit(task.rid); }}, ["Edit"]));

  if (!State.cfg.readOnly) {
    menu.appendChild(el("div", { class: "ctx-sep" }));
    menu.appendChild(el("button", { class: "ctx-item", onclick: () => { dismissContextMenu(); createTask(); }}, ["New Task"]));
    menu.appendChild(el("div", { class: "ctx-sep" }));
    menu.appendChild(el("button", { class: "ctx-item danger", onclick: () => { dismissContextMenu(); if (_deleteTask) _deleteTask(task.rid); }}, ["Delete Task"]));
  }

  let x = e.clientX, y = e.clientY;
  menu.style.left = x + "px";
  menu.style.top = y + "px";
  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 4) + "px";
  if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 4) + "px";

  const dismiss = (ev) => {
    if (!menu.contains(ev.target)) { dismissContextMenu(); document.removeEventListener("pointerdown", dismiss, true); }
  };
  setTimeout(() => document.addEventListener("pointerdown", dismiss, true), 0);
}
