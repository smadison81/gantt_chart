import State, { DEFAULTS } from './state.js';
import { addDays, diffDays } from './utils/dates.js';

export function computeChartWindow() {
  if (!State.tasks.length) {
    State.chartStart = addDays(new Date(), -7);
    State.chartEnd = addDays(new Date(), DEFAULTS.defaultWindowDays);
    return;
  }
  let minStart = State.tasks[0].start;
  let maxEnd = State.tasks[0].end;
  for (const t of State.tasks) {
    if (t.start < minStart) minStart = t.start;
    if (t.end > maxEnd) maxEnd = t.end;
    if (t.baselineStart && t.baselineStart < minStart) minStart = t.baselineStart;
    if (t.baselineEnd && t.baselineEnd > maxEnd) maxEnd = t.baselineEnd;
  }
  State.chartStart = addDays(minStart, -14);
  State.chartEnd = addDays(maxEnd, 21);
}

export function totalDays() {
  return Math.max(1, diffDays(State.chartStart, State.chartEnd) + 1);
}

export function chartWidth() {
  return totalDays() * State.ppd;
}

export function dateToX(d) {
  return diffDays(State.chartStart, d) * State.ppd;
}

export function xToDate(x) {
  return addDays(State.chartStart, Math.round(x / State.ppd));
}
