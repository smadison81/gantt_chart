import State, { ZOOM_LEVELS } from './state.js';
import { addDays, fmtISO } from './utils/dates.js';
import { toast } from './utils/notify.js';
import { computeChartWindow, totalDays, dateToX } from './chart.js';
import { computeVisible } from './filters.js';

// Injected by main.js
let _render = null;

export function injectHooks(render) {
  _render = render;
}

export function setZoom(z) {
  State.zoom = z;
  if (z === "all") {
    const scroll = document.getElementById("timeline-scroll");
    const vw = scroll ? scroll.clientWidth : 1000;
    const days = Math.max(totalDays(), 1);
    State.ppd = Math.max(0.5, vw / days);
  } else {
    State.ppd = ZOOM_LEVELS[z].ppd;
  }
  if (_render) _render();
}

export function fitToTasks() {
  computeChartWindow();
  const scroll = document.getElementById("timeline-scroll");
  if (scroll) {
    const vw = scroll.clientWidth || 800;
    const days = totalDays();
    const idealPpd = vw / days;
    let best = "quarter";
    if (idealPpd >= 30) best = "day";
    else if (idealPpd >= 15) best = "week";
    else if (idealPpd >= 6) best = "month";
    setZoom(best);
  } else {
    if (_render) _render();
  }
}

export function scrollToToday() {
  const scroll = document.getElementById("timeline-scroll");
  if (!scroll) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (today < State.chartStart || today > State.chartEnd) {
    State.chartStart = addDays(today, -30);
    State.chartEnd = addDays(today, 90);
    if (_render) _render();
  }
  const x = dateToX(today);
  scroll.scrollLeft = Math.max(0, x - scroll.clientWidth / 3);
  State._scrollLeft = scroll.scrollLeft;
}

export function selectTask(rid) {
  State.selectedRid = rid;
  if (_render) _render();
}

export function toggleGroup(key) {
  State.groups[key] = !State.groups[key];
  computeVisible();
  if (_render) _render();
}

export function shiftWindow(dir) {
  const scroll = document.getElementById("timeline-scroll");
  if (!scroll) return;
  const shiftMap = { day: 7, week: 30, month: 90, quarter: 180, all: 90 };
  const days = (shiftMap[State.zoom] || 30) * dir;
  scroll.scrollLeft += days * State.ppd;
  State._scrollLeft = scroll.scrollLeft;
}

export function exportCSV() {
  const headers = ["Record ID", "Name", "Start", "End", "Status", "% Complete", "Assigned", "Group"];
  const rows = State.filtered.map(t => [
    t.rid,
    `"${(t.name || "").replace(/"/g, '""')}"`,
    fmtISO(t.start),
    fmtISO(t.end),
    `"${(t.status || "").replace(/"/g, '""')}"`,
    t.percent,
    `"${(t.assigned || "").replace(/"/g, '""')}"`,
    `"${(t.group || "").replace(/"/g, '""')}"`,
  ]);
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gantt-export-${fmtISO(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast("CSV exported", "success");
}

export function exportXLS() {
  const esc = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const headers = ["Record ID", "Name", "Start", "End", "Status", "% Complete", "Assigned", "Group"];
  let rows = "";
  rows += "<Row>" + headers.map(h => `<Cell><Data ss:Type="String">${esc(h)}</Data></Cell>`).join("") + "</Row>\n";
  State.filtered.forEach(t => {
    rows += "<Row>";
    rows += `<Cell><Data ss:Type="Number">${t.rid}</Data></Cell>`;
    rows += `<Cell><Data ss:Type="String">${esc(t.name)}</Data></Cell>`;
    rows += `<Cell><Data ss:Type="String">${fmtISO(t.start)}</Data></Cell>`;
    rows += `<Cell><Data ss:Type="String">${fmtISO(t.end)}</Data></Cell>`;
    rows += `<Cell><Data ss:Type="String">${esc(t.status)}</Data></Cell>`;
    rows += `<Cell><Data ss:Type="Number">${t.percent}</Data></Cell>`;
    rows += `<Cell><Data ss:Type="String">${esc(t.assigned)}</Data></Cell>`;
    rows += `<Cell><Data ss:Type="String">${esc(t.group)}</Data></Cell>`;
    rows += "</Row>\n";
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Gantt Export">
<Table>${rows}</Table>
</Worksheet>
</Workbook>`;
  const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gantt-export-${fmtISO(new Date())}.xls`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Excel exported", "success");
}

export function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

export function scrollToTask(rid) {
  const t = State.tasks.find(x => x.rid === rid);
  if (!t) return;
  const scroll = document.getElementById("timeline-scroll");
  if (scroll) {
    scroll.scrollLeft = Math.max(0, dateToX(t.start) - scroll.clientWidth / 3);
    State._scrollLeft = scroll.scrollLeft;
  }
}
