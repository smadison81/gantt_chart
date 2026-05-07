import State from '../state.js';
import { el } from '../utils/dom.js';
import { addDays, fmtUS } from '../utils/dates.js';

// Set by main.js
let _openQuickEdit = null;

export function setActionRefs(refs) {
  _openQuickEdit = refs.openQuickEdit;
}

export function isCompleteStatus(s) {
  if (!s) return false;
  const lc = s.toLowerCase();
  return lc === "complete" || lc === "completed" || lc === "done" || lc === "closed";
}

export function isInProgressStatus(s) {
  if (!s) return false;
  if (isCompleteStatus(s)) return false;
  const lc = s.toLowerCase();
  if (lc === "not started" || lc === "pending" || lc === "planning" || lc === "new" || lc === "") return false;
  return true;
}

export function renderMobileCards() {
  const container = document.getElementById("mobile-cards");
  if (!container) return;
  container.innerHTML = "";
  container.style.display = "flex";

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const weekOut = addDays(today, 7);

  const buckets = {
    overdue:    { label: "Overdue",       color: "var(--danger)",  dot: "#ef4444", items: [] },
    dueWeek:    { label: "Due This Week", color: "var(--warning)", dot: "#f59e0b", items: [] },
    inProgress: { label: "In Progress",   color: "var(--accent)",  dot: "#3b82f6", items: [] },
    upcoming:   { label: "Upcoming",      color: "var(--info)",    dot: "#6366f1", items: [] },
    complete:   { label: "Complete",       color: "var(--success)", dot: "#10b981", items: [] },
  };

  for (const t of State.filtered) {
    if (!t.start || !t.end) { buckets.upcoming.items.push(t); continue; }
    const done = t.percent >= 100 || isCompleteStatus(t.status);
    if (done) { buckets.complete.items.push(t); continue; }
    const endDate = new Date(t.end); endDate.setHours(0, 0, 0, 0);
    if (endDate < today) { buckets.overdue.items.push(t); continue; }
    if (endDate <= weekOut) { buckets.dueWeek.items.push(t); continue; }
    if (isInProgressStatus(t.status)) { buckets.inProgress.items.push(t); continue; }
    buckets.upcoming.items.push(t);
  }

  buckets.overdue.items.sort((a, b) => a.end - b.end);
  buckets.dueWeek.items.sort((a, b) => a.end - b.end);
  buckets.inProgress.items.sort((a, b) => a.end - b.end);
  buckets.upcoming.items.sort((a, b) => a.start - b.start);
  buckets.complete.items.sort((a, b) => b.end - a.end);

  for (const [key, bucket] of Object.entries(buckets)) {
    if (!bucket.items.length) continue;
    container.appendChild(el("div", { class: "mobile-section-header" }, [
      el("span", { class: "dot", style: { background: bucket.dot }}),
      bucket.label,
      el("span", { class: "count" }, [String(bucket.items.length)]),
    ]));
    for (const t of bucket.items) {
      container.appendChild(buildMobileCard(t, key));
    }
  }

  if (!State.filtered.length) {
    container.appendChild(el("div", {
      style: { padding: "40px 16px", textAlign: "center", color: "var(--text-3)" }
    }, ["No tasks to display"]));
  }
}

function buildMobileCard(t, bucketKey) {
  const card = el("div", { class: "mobile-card", onclick: () => { if (_openQuickEdit) _openQuickEdit(t.rid); } });

  const statusColor = isCompleteStatus(t.status) ? "var(--success)"
    : bucketKey === "overdue" ? "var(--danger)"
    : bucketKey === "dueWeek" ? "var(--warning)"
    : isInProgressStatus(t.status) ? "var(--accent)" : "var(--text-3)";
  const badgeBg = isCompleteStatus(t.status) ? "#ecfdf5"
    : bucketKey === "overdue" ? "#fef2f2"
    : bucketKey === "dueWeek" ? "#fffbeb"
    : isInProgressStatus(t.status) ? "#eff6ff" : "var(--surface-2)";

  const top = el("div", { class: "card-top" }, [
    el("span", { class: "card-name" }, [t.name]),
  ]);
  if (t.status) {
    top.appendChild(el("span", {
      class: "status-badge",
      style: { color: statusColor, background: badgeBg },
    }, [t.status]));
  }
  card.appendChild(top);

  const meta = el("div", { class: "card-meta" });
  if (t.start && t.end) {
    meta.appendChild(el("span", { class: "meta-item" }, [
      fmtUS(t.start) + " \u2192 " + fmtUS(t.end),
    ]));
  }
  if (t.assigned) {
    meta.appendChild(el("span", { class: "meta-item" }, [t.assigned]));
  }
  if (t.isMilestone) {
    meta.appendChild(el("span", { class: "meta-item", style: { color: "var(--info)" }}, ["\u25C6 Milestone"]));
  }
  card.appendChild(meta);

  if (t.percent > 0 || t.start) {
    const barColor = bucketKey === "overdue" ? "var(--danger)"
      : bucketKey === "complete" ? "var(--success)" : "var(--accent)";
    card.appendChild(el("div", { class: "card-progress" }, [
      el("div", { class: "card-progress-fill", style: { width: t.percent + "%", background: barColor }}),
    ]));
  }

  return card;
}

export function removeMobileCards() {
  const container = document.getElementById("mobile-cards");
  if (container) { container.innerHTML = ""; container.style.display = "none"; }
  const fab = document.getElementById("mobile-fab");
  if (fab) fab.style.display = "none";
}
