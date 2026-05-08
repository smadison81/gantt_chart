import State from './state.js';

// Per-DBID temp-token cache. QB temp tokens are scoped to the DBID they were
// issued against; reusing a token across tables (e.g. tasks → deps) returns 401.
const tokenCache = {};

export async function getTempToken(dbid) {
  const headers = {
    "QB-Realm-Hostname": State.realm,
    "Content-Type": "application/json",
  };
  if (State.cfg.appToken) headers["QB-App-Token"] = State.cfg.appToken;
  const res = await fetch(`https://api.quickbase.com/v1/auth/temporary/${dbid}`, {
    method: "GET", headers, credentials: "include",
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Auth failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  const j = await res.json();
  return j.temporaryAuthorization;
}

async function tokenFor(dbid) {
  if (!tokenCache[dbid]) tokenCache[dbid] = await getTempToken(dbid);
  return tokenCache[dbid];
}

export async function qbFetch(path, opts = {}, dbid) {
  const useDbid = dbid || State.cfg.taskDbid;
  let token = await tokenFor(useDbid);
  // Keep State.token in sync for legacy code that reads it directly.
  State.token = token;

  const headers = {
    "QB-Realm-Hostname": State.realm,
    "Authorization": `QB-TEMP-TOKEN ${token}`,
    "Content-Type": "application/json",
    ...(opts.headers || {}),
  };
  if (State.cfg.appToken) headers["QB-App-Token"] = State.cfg.appToken;

  const res = await fetch(`https://api.quickbase.com/v1${path}`, { ...opts, headers });
  const txt = await res.text();
  let json = {};
  try { json = txt ? JSON.parse(txt) : {}; } catch { throw new Error("Invalid JSON: " + txt.slice(0, 200)); }
  if (!res.ok) {
    if (res.status === 401) {
      // Token may have expired (5-minute lifetime); evict and retry once.
      delete tokenCache[useDbid];
      token = await tokenFor(useDbid);
      State.token = token;
      headers.Authorization = `QB-TEMP-TOKEN ${token}`;
      const res2 = await fetch(`https://api.quickbase.com/v1${path}`, { ...opts, headers });
      const txt2 = await res2.text();
      const j2 = txt2 ? JSON.parse(txt2) : {};
      if (!res2.ok) throw new Error(j2.description || j2.message || `${res2.status}`);
      return j2;
    }
    throw new Error(json.description || json.message || `${res.status}: ${txt.slice(0, 200)}`);
  }
  return json;
}

export async function fetchSchema(dbid) {
  return await qbFetch(`/fields?tableId=${dbid}`, { method: "GET" }, dbid);
}

export async function queryRecords(dbid, body) {
  return await qbFetch("/records/query", {
    method: "POST", body: JSON.stringify({ from: dbid, ...body }),
  }, dbid);
}

export async function updateRecords(dbid, data, fieldsToReturn = []) {
  return await qbFetch("/records", {
    method: "POST",
    body: JSON.stringify({ to: dbid, data, fieldsToReturn }),
  }, dbid);
}
