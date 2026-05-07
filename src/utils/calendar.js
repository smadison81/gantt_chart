import State from '../state.js';
import { fmtISO, addDays, diffDays, isWeekend } from './dates.js';

export function parseHolidays(str) {
  if (!str) return [];
  return str.split(",").map(s => s.trim()).filter(Boolean);
}

export function isHoliday(d) {
  const holidays = parseHolidays(State.cfg.holidays);
  if (!holidays.length) return false;
  const mmdd = `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const full = fmtISO(d);
  return holidays.some(h => h === mmdd || h === full);
}

export function isWorkingDay(d) {
  if (State.cfg.skipWeekends && isWeekend(d)) return false;
  if (isHoliday(d)) return false;
  return true;
}

export function addWorkingDays(d, n) {
  if (!State.cfg.skipWeekends && !State.cfg.holidays) return addDays(d, n);
  const x = new Date(d);
  const dir = n >= 0 ? 1 : -1;
  let remaining = Math.abs(n);
  while (remaining > 0) {
    x.setDate(x.getDate() + dir);
    if (isWorkingDay(x)) remaining--;
  }
  return x;
}

export function diffWorkingDays(a, b) {
  if (!State.cfg.skipWeekends && !State.cfg.holidays) return diffDays(a, b);
  let count = 0;
  const start = a < b ? new Date(a) : new Date(b);
  const end = a < b ? b : a;
  const cursor = new Date(start);
  while (cursor < end) {
    cursor.setDate(cursor.getDate() + 1);
    if (isWorkingDay(cursor)) count++;
  }
  return a < b ? count : -count;
}
