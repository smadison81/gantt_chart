export function dateOnly(v) {
  return v ? String(v).substring(0, 10) : "";
}

export function parseDate(v) {
  if (!v) return null;
  const s = dateOnly(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [m, d, y] = s.split("/").map(Number);
    return new Date(y, m - 1, d);
  }
  const dt = new Date(v);
  return isNaN(dt.getTime()) ? null : dt;
}

export function fmtISO(d) {
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtUS(d) {
  if (!d) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function diffDays(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function startOfWeek(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfQuarter(d) {
  return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
}

export function startOfYear(d) {
  return new Date(d.getFullYear(), 0, 1);
}

export function isWeekend(d) {
  const w = d.getDay();
  return w === 0 || w === 6;
}
