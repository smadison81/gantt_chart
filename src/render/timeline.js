import State, { DEFAULTS, ZOOM_LEVELS } from '../state.js';
import { el } from '../utils/dom.js';
import { fmtUS, addDays, startOfWeek, startOfQuarter, isWeekend } from '../utils/dates.js';
import { parseHolidays, isHoliday } from '../utils/calendar.js';
import { chartWidth, dateToX, totalDays } from '../chart.js';
import { renderDependencies, computeCriticalPath } from './deps.js';
import { attachBarDrag } from '../interactions/bar-drag.js';
import { attachProgressDrag } from '../interactions/progress.js';
import { attachDepDraw } from '../interactions/dep-draw.js';
import { allocationsForTask, resourceById, initials } from '../allocations.js';

// Set by main.js
let _selectTask = null;
let _openQuickEdit = null;
let _showContextMenu = null;

export function setActionRefs(refs) {
  _selectTask = refs.selectTask;
  _openQuickEdit = refs.openQuickEdit;
  _showContextMenu = refs.showContextMenu;
}

export function renderTimeline() {
  const headInner = document.getElementById("timeline-head-inner");
  const inner = document.getElementById("timeline-inner");
  const scroll = document.getElementById("timeline-scroll");
  const listBody = document.getElementById("list-body");
  if (!headInner || !inner || !scroll) return;

  const w = chartWidth();
  headInner.innerHTML = "";
  inner.innerHTML = "";
  inner.style.width = w + "px";
  headInner.style.width = w + "px";

  renderTicks(headInner, w);
  renderTodayLine(inner);
  renderTodayFlag(headInner);
  renderRows(inner, w);
  renderDependencies(inner, w);

  let syncing = false;
  scroll.onscroll = () => {
    headInner.style.transform = `translateX(-${scroll.scrollLeft}px)`;
    State._scrollLeft = scroll.scrollLeft;
    if (!syncing && listBody) {
      syncing = true;
      listBody.scrollTop = scroll.scrollTop;
      State._scrollTop = scroll.scrollTop;
      requestAnimationFrame(() => { syncing = false; });
    }
  };
  if (listBody) {
    listBody.onscroll = () => {
      if (!syncing) {
        syncing = true;
        scroll.scrollTop = listBody.scrollTop;
        State._scrollTop = listBody.scrollTop;
        requestAnimationFrame(() => { syncing = false; });
      }
    };
  }

  if (State._scrollLeft != null) {
    scroll.scrollLeft = State._scrollLeft;
    headInner.style.transform = `translateX(-${State._scrollLeft}px)`;
  }
  if (State._scrollTop != null) {
    scroll.scrollTop = State._scrollTop;
    if (listBody) listBody.scrollTop = State._scrollTop;
  }
}

function renderTicks(host, w) {
  const z = ZOOM_LEVELS[State.zoom];
  const start = State.chartStart;

  let cursor = start;
  while (cursor <= State.chartEnd) {
    let next, label;
    if (z.majorUnit === "week") {
      next = startOfWeek(addDays(cursor, 7));
      label = `Week of ${cursor.getMonth() + 1}/${cursor.getDate()}`;
    } else if (z.majorUnit === "month") {
      next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      label = cursor.toLocaleString("default", { month: "long", year: "numeric" });
    } else if (z.majorUnit === "quarter") {
      next = new Date(cursor.getFullYear(), startOfQuarter(cursor).getMonth() + 3, 1);
      label = `Q${Math.floor(cursor.getMonth() / 3) + 1} ${cursor.getFullYear()}`;
    } else {
      next = new Date(cursor.getFullYear() + 1, 0, 1);
      label = String(cursor.getFullYear());
    }
    const x = dateToX(cursor);
    const xn = dateToX(next);
    host.appendChild(el("div", {
      class: "tick-major",
      style: { left: x + "px", width: (xn - x) + "px" },
    }, [label]));
    cursor = next;
  }

  cursor = start;
  while (cursor <= State.chartEnd) {
    let next, label;
    if (z.minorUnit === "day") {
      next = addDays(cursor, 1);
      label = String(cursor.getDate());
    } else if (z.minorUnit === "week") {
      next = startOfWeek(addDays(cursor, 7));
      label = `${cursor.getMonth() + 1}/${cursor.getDate()}`;
    } else if (z.minorUnit === "month") {
      next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      label = cursor.toLocaleString("default", { month: "short" });
    } else {
      next = new Date(cursor.getFullYear(), startOfQuarter(cursor).getMonth() + 3, 1);
      label = `Q${Math.floor(cursor.getMonth() / 3) + 1}`;
    }
    const x = dateToX(cursor);
    const xn = dateToX(next);
    if ((xn - x) >= 18) {
      host.appendChild(el("div", {
        class: "tick-minor",
        style: { left: x + "px", width: (xn - x) + "px" },
      }, [label]));
    }
    cursor = next;
  }
}

function renderTodayLine(host) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (today < State.chartStart || today > State.chartEnd) return;
  const x = dateToX(today);
  host.appendChild(el("div", { class: "today-line", style: { left: x + "px" }}));
}

function renderTodayFlag(host) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (today < State.chartStart || today > State.chartEnd) return;
  const x = dateToX(today);
  host.appendChild(el("div", {
    class: "today-flag",
    style: { left: x + "px" },
  }, [
    el("span", { class: "dot" }),
    el("span", {}, ["TODAY"]),
  ]));
}

function renderRows(host, w) {
  if (!State.visible.length) {
    host.appendChild(el("div", { class: "empty" }, ["No tasks visible"]));
    return;
  }

  if (State.zoom === "day" || State.zoom === "week") {
    let cursor = startOfWeek(State.chartStart);
    while (cursor <= State.chartEnd) {
      if (State.zoom === "day") {
        const sat = addDays(cursor, 6);
        const x1 = dateToX(sat);
        const x2 = x1 + 2 * State.ppd;
        host.appendChild(el("div", {
          class: "row-grid weekend",
          style: { left: x1 + "px", width: (x2 - x1) + "px" },
        }));
      }
      cursor = addDays(cursor, 7);
    }
  }

  if (State.cfg.holidays && State.zoom === "day") {
    let cursor = new Date(State.chartStart);
    while (cursor <= State.chartEnd) {
      if (isHoliday(cursor) && !isWeekend(cursor)) {
        const x = dateToX(cursor);
        host.appendChild(el("div", {
          class: "row-grid holiday",
          style: { left: x + "px", width: State.ppd + "px" },
        }));
      }
      cursor = addDays(cursor, 1);
    }
  }

  const criticalRids = computeCriticalPath();

  State.visible.forEach((item, idx) => {
    if (item.type === "group") {
      host.appendChild(el("div", {
        class: "tl-row group-header",
        style: { width: w + "px" },
      }));
      return;
    }
    const t = item.task;
    const sel = State.selectedRid === t.rid ? " selected" : "";
    const row = el("div", {
      class: "tl-row" + sel,
      style: { width: w + "px" },
      "data-rid": t.rid,
    });

    if (State.showBaselines && t.baselineStart && t.baselineEnd) {
      const bx = dateToX(t.baselineStart);
      const bw = Math.max(2, dateToX(addDays(t.baselineEnd, 1)) - bx);
      row.appendChild(el("div", {
        class: "baseline-bar",
        style: { left: bx + "px", width: bw + "px" },
      }));
    }

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const isLate = t.end < today && t.percent < 100;
    const statusClass = (() => {
      if (t.percent >= 100) return "complete";
      if (isLate) return "late";
      const s = (t.status || "").toLowerCase().trim();
      if (!s || s === "not started" || s.includes("not start") || s.includes("pending") || s === "planning") return "not-started";
      if (s.includes("complete") || s.includes("done") || s === "closed") return "complete";
      if (s.includes("block") || s.includes("hold") || s.includes("cancel")) return "blocked";
      if (s.includes("progress") || s.includes("active") || s.includes("ongoing")) return "in-progress";
      return "not-started";
    })();

    const x = dateToX(t.start);
    const barWidth = Math.max(t.isMilestone ? 24 : 4,
      dateToX(addDays(t.end, 1)) - x);

    const critClass = criticalRids.has(t.rid) ? " critical" : "";
    const isSummary = t.isParent && State.cfg.fidParentTask;

    const bar = el("div", {
      class: "bar " + statusClass + (t.isMilestone ? " milestone" : "") + (isSummary ? " summary" : "") + critClass,
      style: { left: x + "px", width: barWidth + "px" },
      title: `${t.name}\n${fmtUS(t.start)} \u2192 ${fmtUS(t.end)}\n${t.status} | ${t.percent}%`,
      "data-rid": t.rid,
      onclick: e => { e.stopPropagation(); if (_selectTask) _selectTask(t.rid); },
      ondblclick: () => { if (_openQuickEdit) _openQuickEdit(t.rid); },
      oncontextmenu: e => { if (_showContextMenu) _showContextMenu(e, t); },
    });

    if (t.percent > 0 && t.percent < 100 && !t.isMilestone && !isSummary) {
      const pctFill = el("div", {
        class: "pct-fill",
        style: { width: t.percent + "%" },
      });
      bar.appendChild(pctFill);

      if (State.cfg.fidPercent && !State.cfg.readOnly) {
        const pctHandle = el("div", {
          class: "pct-handle",
          style: { left: t.percent + "%" },
        });
        attachProgressDrag(pctHandle, bar, t);
        bar.appendChild(pctHandle);
      }
    }

    // Status glyph (○ ◐ ● ▲ ■)
    if (!t.isMilestone && !isSummary) {
      const glyphMap = {
        "not-started": "○", // ○
        "in-progress": "◐", // ◐
        "complete":    "●", // ●
        "late":        "▲", // ▲
        "blocked":     "■", // ■
      };
      const g = glyphMap[statusClass];
      if (g) bar.appendChild(el("span", { class: "glyph" }, [g]));
    }

    // Label: inside if bar >= 80px, outside-right otherwise
    if (!t.isMilestone && !isSummary && State.showLabels) {
      if (barWidth >= 80) {
        bar.appendChild(el("div", { class: "lbl" }, [t.name]));
      } else {
        bar.appendChild(el("div", { class: "lbl-out" }, [t.name]));
      }
    }

    if (State.cfg.allocDbid && !isSummary) {
      const allocs = allocationsForTask(t.rid);
      if (allocs.length) {
        const names = allocs.map(a => {
          const r = resourceById(a.resourceRid);
          return r ? r.name : `#${a.resourceRid}`;
        });
        const chips = el("div", { class: "res-chips", title: names.join(", ") });
        const max = 3;
        const visible = allocs.slice(0, max);
        visible.forEach((a, i) => {
          const r = resourceById(a.resourceRid);
          const nm = r ? r.name : `#${a.resourceRid}`;
          chips.appendChild(el("span", {
            class: "res-chip",
            style: { background: chipColor(a.resourceRid) },
            title: nm,
          }, [initials(nm)]));
        });
        if (allocs.length > max) {
          chips.appendChild(el("span", { class: "res-chip overflow" }, [`+${allocs.length - max}`]));
        }
        bar.appendChild(chips);
      }
    }

    if (State.cfg.allowResize && !t.isMilestone && !isSummary && !State.cfg.readOnly) {
      bar.appendChild(el("div", { class: "handle left", "data-handle": "left" }));
      bar.appendChild(el("div", { class: "handle right", "data-handle": "right" }));
    }

    if (State.cfg.depDbid && !State.cfg.readOnly && !isSummary) {
      const conn = el("div", { class: "connector", title: "Drag to create dependency" });
      attachDepDraw(conn, t);
      bar.appendChild(conn);
    }

    row.appendChild(bar);

    if (State.cfg.allowDrag && !isSummary && !State.cfg.readOnly) {
      attachBarDrag(bar, t);
    }

    host.appendChild(row);
  });

  host.style.minHeight = (State.visible.length * DEFAULTS.rowHeight + 40) + "px";
}

function chipColor(rid) {
  const palette = [
    "#0a66c2", "#0e7c66", "#a23a3a", "#7a4eb8", "#b8772a",
    "#2e7d32", "#ad1457", "#5e35b1", "#00838f", "#6a1b9a",
  ];
  return palette[Math.abs(Number(rid) || 0) % palette.length];
}
