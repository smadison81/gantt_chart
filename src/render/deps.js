import State, { DEFAULTS } from '../state.js';
import { fmtISO, addDays } from '../utils/dates.js';
import { dateToX } from '../chart.js';

export function renderDependencies(host, w) {
  if (!State.showDeps || !State.dependencies.length) return;
  const rowIdx = {};
  State.visible.forEach((item, idx) => {
    if (item.type === "task") rowIdx[item.task.rid] = idx;
  });
  const rh = DEFAULTS.rowHeight;
  const totalH = State.visible.length * rh;

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "dep-svg");
  svg.setAttribute("width", w);
  svg.setAttribute("height", totalH);
  svg.style.width = w + "px";
  svg.style.height = totalH + "px";

  const defs = document.createElementNS(ns, "defs");
  const marker = document.createElementNS(ns, "marker");
  marker.setAttribute("id", "arrow");
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "8");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "6");
  marker.setAttribute("markerHeight", "6");
  marker.setAttribute("orient", "auto-start-reverse");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  path.setAttribute("fill", "#94a3b8");
  marker.appendChild(path);
  defs.appendChild(marker);
  svg.appendChild(defs);

  State.dependencies.forEach(dep => {
    const pred = State.tasks.find(t => t.rid === dep.pred);
    const succ = State.tasks.find(t => t.rid === dep.succ);
    if (!pred || !succ) return;
    const pi = rowIdx[pred.rid], si = rowIdx[succ.rid];
    if (pi == null || si == null) return;

    const y1 = pi * rh + rh / 2;
    const y2 = si * rh + rh / 2;
    const type = (dep.type || "FS").toUpperCase();

    let x1, x2;
    if (type === "SS") {
      x1 = dateToX(pred.start);
      x2 = dateToX(succ.start);
    } else if (type === "FF") {
      x1 = dateToX(addDays(pred.end, 1));
      x2 = dateToX(addDays(succ.end, 1));
    } else if (type === "SF") {
      x1 = dateToX(pred.start);
      x2 = dateToX(addDays(succ.end, 1));
    } else {
      x1 = dateToX(addDays(pred.end, 1));
      x2 = dateToX(succ.start);
    }

    const violated = checkDepViolation(dep, pred, succ);
    const midX = Math.max(x1 + 8, Math.min(x2 - 8, (x1 + x2) / 2));
    const pe = document.createElementNS(ns, "path");
    pe.setAttribute("class", "dep-line" + (violated ? " violation" : ""));
    pe.setAttribute("d", `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`);
    pe.setAttribute("marker-end", "url(#arrow)");
    svg.appendChild(pe);
  });

  host.appendChild(svg);
}

export function checkDepViolation(dep, pred, succ) {
  const type = (dep.type || "FS").toUpperCase();
  const lag = dep.lag || 0;
  if (type === "FS") return succ.start < addDays(pred.end, 1 + lag);
  if (type === "SS") return succ.start < addDays(pred.start, lag);
  if (type === "FF") return succ.end < addDays(pred.end, lag);
  if (type === "SF") return succ.end < addDays(pred.start, lag);
  return false;
}

export function computeCriticalPath() {
  if (!State.tasks.length) return new Set();
  let maxEnd = State.tasks[0].end;
  for (const t of State.tasks) if (t.end > maxEnd) maxEnd = t.end;
  const critical = new Set();
  State.tasks.forEach(t => {
    if (fmtISO(t.end) === fmtISO(maxEnd)) critical.add(t.rid);
  });
  let changed = true;
  while (changed) {
    changed = false;
    State.dependencies.forEach(d => {
      if (critical.has(d.succ) && !critical.has(d.pred)) {
        critical.add(d.pred); changed = true;
      }
    });
  }
  return critical;
}
