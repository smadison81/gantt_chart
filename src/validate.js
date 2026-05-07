import State from './state.js';
import { el } from './utils/dom.js';
import { diffDays } from './utils/dates.js';
import { checkDepViolation } from './render/deps.js';
import { closeQuickEdit } from './quickedit.js';
import { selectTask, scrollToTask } from './actions.js';

// Injected by main.js
let _render = null;

export function injectHooks(render) {
  _render = render;
}

export function validateSchedule() {
  const issues = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);

  State.tasks.forEach(t => {
    if (!t.start) issues.push({ rid: t.rid, sev: "error", msg: `${t.name} is missing a start date`, name: t.name });
    if (!t.end) issues.push({ rid: t.rid, sev: "error", msg: `${t.name} is missing an end date`, name: t.name });
    if (t.start && t.end && t.end < t.start) issues.push({ rid: t.rid, sev: "error", msg: `${t.name} ends before it starts`, name: t.name });
    if (t.start && t.end && t.end < today && t.percent < 100) issues.push({ rid: t.rid, sev: "warning", msg: `${t.name} is past due (${t.percent}% complete)`, name: t.name });
    if (t.baselineStart && t.start) {
      const drift = diffDays(t.baselineStart, t.start);
      if (Math.abs(drift) > 14) issues.push({ rid: t.rid, sev: "info", msg: `${t.name} drifted ${drift > 0 ? "+" : ""}${drift} days from baseline`, name: t.name });
    }
  });

  State.dependencies.forEach(d => {
    const p = State.tasks.find(t => t.rid === d.pred);
    const s = State.tasks.find(t => t.rid === d.succ);
    if (!p || !s) return;
    if (checkDepViolation(d, p, s)) {
      const type = (d.type || "FS").toUpperCase();
      issues.push({ rid: s.rid, sev: "error", msg: `${s.name}: ${type} dependency on ${p.name} violated (+${d.lag || 0} lag)`, name: s.name });
    }
  });

  showValidationPanel(issues);
}

function showValidationPanel(issues) {
  const sp = document.getElementById("side-panel");
  sp.innerHTML = "";
  sp.appendChild(el("div", { class: "ph" }, [
    el("h3", {}, ["Schedule Validation"]),
    el("button", { class: "btn ghost", onclick: closeQuickEdit }, ["\u2715"]),
  ]));
  const body = el("div", { class: "pb", style: { padding: 0 }});
  if (!issues.length) {
    body.appendChild(el("div", { class: "empty" }, [
      el("div", { class: "ico" }, ["\u2713"]),
      el("div", {}, ["No issues found."]),
    ]));
  } else {
    const ul = el("ul", { class: "validation-list" });
    issues.forEach(i => {
      ul.appendChild(el("li", {
        class: i.sev,
        onclick: () => { selectTask(i.rid); scrollToTask(i.rid); }
      }, [
        el("div", { class: "sev" }),
        el("div", {}, [
          el("div", {}, [i.msg]),
          el("div", { class: "meta" }, [`Record #${i.rid}`]),
        ]),
      ]));
    });
    body.appendChild(ul);
  }
  sp.appendChild(body);
  sp.classList.add("open");
}
