import State from '../state.js';
import { el } from './dom.js';

export function toast(msg, type = "") {
  const t = el("div", { class: "toast " + type }, [msg]);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

export function showError(err) {
  console.error(err);
  const app = document.getElementById("app");
  if (!document.getElementById("toolbar")) {
    app.innerHTML = "";
    app.appendChild(el("div", { class: "err" }, [
      el("div", { class: "ico" }, ["\u26A0"]),
      el("h2", {}, ["Could not load Gantt"]),
      el("pre", {}, [String(err.message || err)]),
      el("div", { style: { fontSize: "12px", color: "var(--text-3)", marginTop: "12px" }}, [
        "Open ?setup=true to reconfigure."
      ]),
    ]));
  } else {
    setStatus("Error: " + (err.message || err), "err");
  }
}

export function setStatus(msg, type = "info") {
  const sb = document.getElementById("statusbar");
  if (!sb) return;
  sb.innerHTML = "";
  sb.appendChild(el("span", { class: "pill " + type }, [msg]));

  const t = State.filtered.length;
  const all = State.tasks.length;
  if (all) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const late = State.tasks.filter(tk => tk.end < today && tk.percent < 100).length;
    const done = State.tasks.filter(tk => tk.percent >= 100).length;
    sb.appendChild(el("span", {}, [`${t} of ${all} visible`]));
    if (late) sb.appendChild(el("span", { class: "pill err" }, [`${late} late`]));
    if (done) sb.appendChild(el("span", { class: "pill ok" }, [`${done} done`]));
  }
  sb.appendChild(el("span", { style: { marginLeft: "auto", color: "var(--text-3)", fontSize: "11px" }}, [
    `Zoom: ${State.zoom} | ${State.ppd}px/day`
  ]));
}
