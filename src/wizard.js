import State from './state.js';
import { el } from './utils/dom.js';
import { getParam } from './config.js';
import { fetchSchema, queryRecords } from './api.js';

const Wiz = {
  step: 1,
  realm: "",
  taskDbid: "",
  pageId: "",
  fields: [],
  mapping: {},
  testResult: null,
  depDbid: "",
  depFields: [],
  depMapping: {},
};

export function startWizard() {
  Wiz.realm = window.location.hostname;
  Wiz.pageId = getParam("pageid") || getParam("pid") || "";
  Wiz.taskDbid = getParam("taskdbid");
  renderWizard();
}

function renderWizard() {
  const app = document.getElementById("app");
  app.innerHTML = `<div class="wizard"><div class="container" id="wizard-body"></div></div>`;
  const body = document.getElementById("wizard-body");
  body.innerHTML = "";

  body.appendChild(el("h1", {}, ["Quickbase Gantt Setup"]));
  body.appendChild(el("p", { class: "lead" }, [
    "Wire any Quickbase task table into a fully featured Gantt chart in under a minute. No plugin install. No required schema."
  ]));

  const steps = el("div", { class: "steps" });
  ["Connect", "Map fields", "Optional features", "Generate button"].forEach((label, i) => {
    const n = i + 1;
    const cls = Wiz.step === n ? "active" : (Wiz.step > n ? "done" : "");
    steps.appendChild(el("div", { class: "step " + cls }, [
      el("span", { class: "num" }, [String(n)]),
      label,
    ]));
  });
  body.appendChild(steps);

  if (Wiz.step === 1) renderWizStep1(body);
  else if (Wiz.step === 2) renderWizStep2(body);
  else if (Wiz.step === 3) renderWizStep3(body);
  else if (Wiz.step === 4) renderWizStep4(body);
}

function renderWizStep1(body) {
  const card = el("div", { class: "card" }, [
    el("h2", {}, ["Connect to your task table"]),
    el("p", { class: "desc" }, [
      "Paste the Task table DBID. The wizard will pull the schema, auto-detect Start, End, Name, and Status fields, and let you confirm."
    ]),
    el("div", { class: "fld" }, [
      el("label", {}, ["Realm"]),
      el("input", { type: "text", id: "wiz-realm", value: Wiz.realm, readonly: "readonly", style: { background: "var(--surface-2)" }}),
      el("div", { class: "help" }, ["Auto-detected from this page's URL."]),
    ]),
    el("div", { class: "fld" }, [
      el("label", {}, ["Code page ID"]),
      el("input", { type: "text", id: "wiz-pageid", value: Wiz.pageId, placeholder: "e.g. 12 (the ID Quickbase assigns when you save this page)" }),
      el("div", { class: "help" }, ["Found in URL after you save the code page: a=dbpage&pageid=XX. Used to build the launch button."]),
    ]),
    el("div", { class: "fld" }, [
      el("label", {}, ["Task table DBID"]),
      el("input", { type: "text", id: "wiz-dbid", value: Wiz.taskDbid, placeholder: "e.g. bvx6j9yjm" }),
      el("div", { class: "help" }, ["Open your task table \u2192 Settings \u2192 Advanced. The DBID is in the URL after /db/."]),
    ]),
    el("div", { class: "card-actions" }, [
      el("div", {}),
      el("button", { class: "btn primary", onclick: wizFetchSchema }, ["Continue"]),
    ]),
  ]);
  body.appendChild(card);
}

async function wizFetchSchema() {
  Wiz.realm = document.getElementById("wiz-realm").value.trim();
  Wiz.pageId = document.getElementById("wiz-pageid").value.trim();
  Wiz.taskDbid = document.getElementById("wiz-dbid").value.trim();
  if (!Wiz.taskDbid) { alert("Enter the task table DBID."); return; }
  State.realm = Wiz.realm;

  const btn = document.querySelector(".card-actions .btn.primary");
  btn.disabled = true; btn.textContent = "Loading...";
  try {
    State.cfg = { taskDbid: Wiz.taskDbid, appToken: "" };
    State.token = "";
    const fields = await fetchSchema(Wiz.taskDbid);
    Wiz.fields = fields;
    Wiz.mapping = autoMap(fields);
    Wiz.step = 2;
    renderWizard();
  } catch (e) {
    btn.disabled = false; btn.textContent = "Continue";
    alert("Could not load schema: " + e.message + "\n\nMake sure you're logged into Quickbase and the DBID is correct.");
  }
}

function autoMap(fields) {
  const byType = {};
  fields.forEach(f => {
    const t = f.fieldType || "";
    if (!byType[t]) byType[t] = [];
    byType[t].push(f);
  });

  const dateFields = (byType["date"] || []).concat(byType["timestamp"] || []);
  const textFields = (byType["text"] || []).concat(byType["text-multi-line"] || [], byType["text-multiple-choice"] || []);
  const numericFields = (byType["numeric"] || []).concat(byType["percent"] || [], byType["currency"] || []);
  const checkboxFields = byType["checkbox"] || [];

  const guess = {
    fidName: pickFirst(fields, [/^name$/i, /phase\s*name/i, /task\s*name/i, /title/i, /^summary/i]) || pickFirst(textFields, [/.*/]),
    fidStart: pickFirst(dateFields, [/^start$/i, /start.*date/i, /begin/i]),
    fidEnd: pickFirst(dateFields, [/^end$/i, /end.*date/i, /finish/i, /due/i, /target/i]),
    fidStartSave: pickFirst(dateFields, [/start.*date.*manual/i, /manual.*start/i, /editable.*start/i]),
    fidStatus: pickFirst(fields, [/^status$/i, /state/i, /phase\s*status/i]),
    fidPercent: pickFirst(numericFields, [/percent.*complete/i, /%.*complete/i, /progress/i]),
    fidAssigned: pickFirst(fields, [/assigned.*to/i, /owner/i, /^assignee/i]),
    fidGroup: pickFirst(fields, [/^phase$/i, /^group$/i, /work\s*stream/i, /category/i]),
    fidMilestone: pickFirst(checkboxFields, [/milestone/i]),
    fidPriority: pickFirst(fields, [/^priority$/i, /^rank$/i]),
    fidProject: pickFirst(fields, [/project.*record\s*id/i, /related\s*project/i, /^project$/i, /project.*id/i]),
    fidBaselineStart: pickFirst(dateFields, [/baseline.*start/i, /planned.*start/i, /original.*start/i]),
    fidBaselineEnd: pickFirst(dateFields, [/baseline.*end/i, /planned.*end/i, /original.*end/i, /baseline.*finish/i]),
    fidParentTask: pickFirst(fields, [/parent.*task/i, /parent.*rid/i, /parent.*record/i]),
    fidSortOrder: pickFirst(numericFields, [/sort.*order/i, /^order$/i, /sequence/i]),
    fidWbs: pickFirst(textFields, [/^wbs$/i, /wbs.*code/i]),
    fidDuration: pickFirst(numericFields, [/^duration$/i, /duration.*days/i]),
  };
  Object.keys(guess).forEach(k => { if (!guess[k]) delete guess[k]; });
  return guess;
}

function pickFirst(fields, patterns) {
  for (const pat of patterns) {
    for (const f of fields) {
      if (pat.test(f.label || "")) return f.id;
    }
  }
  return 0;
}

function renderWizStep2(body) {
  const map = Wiz.mapping;
  const card = el("div", { class: "card" }, [
    el("h2", {}, ["Map your fields"]),
    el("p", { class: "desc" }, [
      `Found ${Wiz.fields.length} fields in the table. Auto-detected mappings are highlighted in green. Adjust if needed.`
    ]),
  ]);

  const grid = el("div", { class: "field-map" });

  function fieldRow(key, label, hint, required = false, filterFn = null) {
    grid.appendChild(el("label", {}, [
      el("span", {}, [label, required ? el("span", { class: "req" }, [" *"]) : null]),
      el("span", { class: "hint" }, [hint || ""]),
    ]));
    const sel = el("select", { id: "wm-" + key });
    sel.appendChild(el("option", { value: "" }, ["\u2014 Not mapped \u2014"]));
    const opts = filterFn ? Wiz.fields.filter(filterFn) : Wiz.fields;
    opts.forEach(f => {
      const o = el("option", { value: f.id }, [`${f.label} (FID ${f.id})`]);
      if (map[key] === f.id) o.selected = true;
      sel.appendChild(o);
    });
    sel.className = map[key] ? "match" : (required ? "unmapped" : "");
    sel.addEventListener("change", e => {
      Wiz.mapping[key] = Number(e.target.value) || 0;
      sel.className = Wiz.mapping[key] ? "match" : (required ? "unmapped" : "");
    });
    grid.appendChild(sel);
  }

  grid.appendChild(el("div", { class: "group-title" }, ["Required"]));
  fieldRow("fidName", "Task / Phase Name", "Bar label", true);
  fieldRow("fidStart", "Start Date", "Where the bar begins", true, f => /date|timestamp/i.test(f.fieldType));
  fieldRow("fidEnd", "End Date", "Where the bar ends", true, f => /date|timestamp/i.test(f.fieldType));

  grid.appendChild(el("div", { class: "group-title" }, ["Project filter"]));
  fieldRow("fidProject", "Project Record ID lookup", "FID on the task table that holds the parent project record ID", false);

  grid.appendChild(el("div", { class: "group-title" }, ["Recommended"]));
  fieldRow("fidStatus", "Status", "Drives bar color");
  fieldRow("fidPercent", "Percent Complete", "0-100 progress fill", false, f => /numeric|percent/i.test(f.fieldType));
  fieldRow("fidStartSave", "Editable Start Date", "Optional save target if Start is calculated/lookup. Leave blank to save back to Start Date.", false, f => /date|timestamp/i.test(f.fieldType));

  grid.appendChild(el("div", { class: "group-title" }, ["Optional"]));
  fieldRow("fidAssigned", "Assigned To", "Filter and quick edit");
  fieldRow("fidGroup", "Group / Phase", "Bucket bars by phase");
  fieldRow("fidMilestone", "Milestone Flag", "Checkbox; renders as a diamond", false, f => /checkbox/i.test(f.fieldType));
  fieldRow("fidPriority", "Priority", "Display only");

  grid.appendChild(el("div", { class: "group-title" }, ["Hierarchy & ordering"]));
  fieldRow("fidParentTask", "Parent Task RID", "Enables outline/WBS hierarchy");
  fieldRow("fidSortOrder", "Sort Order", "Numeric field for manual task ordering", false, f => /numeric/i.test(f.fieldType));
  fieldRow("fidWbs", "WBS Code", "Text field for WBS numbering");
  fieldRow("fidDuration", "Duration", "Numeric duration field", false, f => /numeric/i.test(f.fieldType));

  grid.appendChild(el("div", { class: "group-title" }, ["Baselines (optional)"]));
  fieldRow("fidBaselineStart", "Baseline Start", "Renders ghost bar under current schedule", false, f => /date|timestamp/i.test(f.fieldType));
  fieldRow("fidBaselineEnd", "Baseline End", "", false, f => /date|timestamp/i.test(f.fieldType));

  card.appendChild(grid);
  card.appendChild(el("div", { class: "card-actions" }, [
    el("button", { class: "btn", onclick: () => { Wiz.step = 1; renderWizard(); }}, ["Back"]),
    el("div", { style: { display: "flex", gap: "8px" }}, [
      el("button", { class: "btn", onclick: wizTestQuery }, ["Test Query"]),
      el("button", { class: "btn primary", onclick: () => { wizCollectMapping(); Wiz.step = 3; renderWizard(); }}, ["Continue"]),
    ]),
  ]));
  body.appendChild(card);

  if (Wiz.testResult) {
    body.appendChild(el("div", { class: "note " + (Wiz.testResult.ok ? "" : "err") }, [Wiz.testResult.msg]));
  }
}

function wizCollectMapping() {
  ["fidName", "fidStart", "fidEnd", "fidProject", "fidStatus", "fidPercent", "fidStartSave",
   "fidAssigned", "fidGroup", "fidMilestone", "fidPriority", "fidBaselineStart", "fidBaselineEnd",
   "fidParentTask", "fidSortOrder", "fidWbs", "fidDuration"].forEach(k => {
    const node = document.getElementById("wm-" + k);
    if (node) Wiz.mapping[k] = Number(node.value) || 0;
  });
}

async function wizTestQuery() {
  wizCollectMapping();
  if (!Wiz.mapping.fidName || !Wiz.mapping.fidStart || !Wiz.mapping.fidEnd) {
    Wiz.testResult = { ok: false, msg: "Map Name, Start Date, and End Date before testing." };
    renderWizard();
    return;
  }
  try {
    State.cfg = { taskDbid: Wiz.taskDbid, appToken: "" };
    State.token = "";
    const result = await queryRecords(Wiz.taskDbid, {
      select: [3, Wiz.mapping.fidName, Wiz.mapping.fidStart, Wiz.mapping.fidEnd],
      options: { top: 5 },
    });
    const n = (result.data || []).length;
    Wiz.testResult = { ok: true, msg: `Test query succeeded. Sampled ${n} record${n === 1 ? "" : "s"} from the task table.` };
  } catch (e) {
    Wiz.testResult = { ok: false, msg: "Test failed: " + e.message };
  }
  renderWizard();
}

function renderWizStep3(body) {
  const card = el("div", { class: "card" }, [
    el("h2", {}, ["Optional: dependencies"]),
    el("p", { class: "desc" }, [
      "If you have a Dependencies table linking predecessor and successor tasks, point to it here. Skip if you don't."
    ]),
    el("div", { class: "fld" }, [
      el("label", {}, ["Dependency table DBID (optional)"]),
      el("input", { type: "text", id: "wiz-dep-dbid", value: Wiz.depDbid, placeholder: "Leave blank to skip" }),
    ]),
    el("div", { class: "card-actions" }, [
      el("button", { class: "btn", onclick: () => { Wiz.step = 2; renderWizard(); }}, ["Back"]),
      el("div", { style: { display: "flex", gap: "8px" }}, [
        el("button", { class: "btn", onclick: wizLoadDepSchema }, ["Load Dep Schema"]),
        el("button", { class: "btn primary", onclick: () => { Wiz.step = 4; renderWizard(); }}, ["Skip / Continue"]),
      ]),
    ]),
  ]);
  body.appendChild(card);

  if (Wiz.depFields.length) {
    const dcard = el("div", { class: "card" }, [el("h2", {}, ["Map dependency fields"])]);
    const grid = el("div", { class: "field-map" });
    function depRow(key, label, filterFn = null) {
      grid.appendChild(el("label", {}, [label]));
      const sel = el("select", { id: "wd-" + key });
      sel.appendChild(el("option", { value: "" }, ["\u2014 Not mapped \u2014"]));
      const opts = filterFn ? Wiz.depFields.filter(filterFn) : Wiz.depFields;
      opts.forEach(f => {
        const o = el("option", { value: f.id }, [`${f.label} (FID ${f.id})`]);
        if (Wiz.depMapping[key] === f.id) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener("change", e => { Wiz.depMapping[key] = Number(e.target.value) || 0; });
      grid.appendChild(sel);
    }
    depRow("fidDepPred", "Predecessor task RID");
    depRow("fidDepSucc", "Successor task RID");
    depRow("fidDepType", "Type (FS/SS/FF/SF)");
    depRow("fidDepLag", "Lag (days)", f => /numeric/i.test(f.fieldType));
    depRow("fidDepProject", "Project RID (filter)");
    dcard.appendChild(grid);
    body.appendChild(dcard);
  }
}

async function wizLoadDepSchema() {
  Wiz.depDbid = document.getElementById("wiz-dep-dbid").value.trim();
  if (!Wiz.depDbid) { alert("Enter the dependency table DBID."); return; }
  try {
    State.token = "";
    State.cfg = { taskDbid: Wiz.depDbid, appToken: "" };
    Wiz.depFields = await fetchSchema(Wiz.depDbid);
    Wiz.depMapping = {
      fidDepPred: pickFirst(Wiz.depFields, [/predecessor/i, /^pred/i]),
      fidDepSucc: pickFirst(Wiz.depFields, [/successor/i, /^succ/i]),
      fidDepType: pickFirst(Wiz.depFields, [/type/i]),
      fidDepLag: pickFirst(Wiz.depFields, [/lag/i]),
      fidDepProject: pickFirst(Wiz.depFields, [/project.*record/i, /^project/i]),
    };
    renderWizard();
  } catch (e) {
    alert("Could not load: " + e.message);
  }
}

function renderWizStep4(body) {
  const m = Wiz.mapping;
  const dm = Wiz.depMapping || {};
  const params = new URLSearchParams();
  params.set("a", "dbpage");
  if (Wiz.pageId) params.set("pageid", Wiz.pageId);
  params.set("taskdbid", Wiz.taskDbid);
  if (m.fidName) params.set("namefid", m.fidName);
  if (m.fidStart) params.set("startfid", m.fidStart);
  if (m.fidEnd) params.set("endfid", m.fidEnd);
  if (m.fidStartSave) params.set("startsavefid", m.fidStartSave);
  if (m.fidProject) params.set("projectfid", m.fidProject);
  if (m.fidStatus) params.set("statusfid", m.fidStatus);
  if (m.fidPercent) params.set("percentfid", m.fidPercent);
  if (m.fidAssigned) params.set("assignedfid", m.fidAssigned);
  if (m.fidGroup) params.set("groupfid", m.fidGroup);
  if (m.fidMilestone) params.set("milestonefid", m.fidMilestone);
  if (m.fidPriority) params.set("priorityfid", m.fidPriority);
  if (m.fidBaselineStart) params.set("baselinestartfid", m.fidBaselineStart);
  if (m.fidBaselineEnd) params.set("baselineendfid", m.fidBaselineEnd);
  if (m.fidParentTask) params.set("parentfid", m.fidParentTask);
  if (m.fidSortOrder) params.set("sortorderfid", m.fidSortOrder);
  if (m.fidWbs) params.set("wbsfid", m.fidWbs);
  if (m.fidDuration) params.set("durationfid", m.fidDuration);
  if (Wiz.depDbid) params.set("depdbid", Wiz.depDbid);
  if (dm.fidDepPred) params.set("deppredfid", dm.fidDepPred);
  if (dm.fidDepSucc) params.set("depsuccfid", dm.fidDepSucc);
  if (dm.fidDepType) params.set("deptypefid", dm.fidDepType);
  if (dm.fidDepLag) params.set("deplagfid", dm.fidDepLag);
  if (dm.fidDepProject) params.set("depprojectfid", dm.fidDepProject);

  const queryStr = params.toString();
  const buttonFormula = `// Open Project Gantt
URLRoot() & "db/" & AppID() &
"?${queryStr}" &
"&projectrid=" & URLEncode(ToText([Record ID#]))`;

  const directUrl = `https://${Wiz.realm}/db/[YOUR_APP_DBID]?${queryStr}&projectrid=[PROJECT_RID]`;

  const summary = el("div", { class: "summary-grid" });
  function pair(k, v) {
    summary.appendChild(el("div", { class: "k" }, [k]));
    summary.appendChild(el("div", { class: "v" }, [String(v || "\u2014")]));
  }
  pair("Realm", Wiz.realm);
  pair("Task DBID", Wiz.taskDbid);
  pair("Code page ID", Wiz.pageId || "(set after saving)");
  pair("Mapped fields", Object.keys(m).filter(k => m[k]).length);
  if (Wiz.depDbid) pair("Dep DBID", Wiz.depDbid);

  body.appendChild(el("div", { class: "card" }, [el("h2", {}, ["Configuration summary"]), summary]));

  body.appendChild(el("div", { class: "card" }, [
    el("h2", {}, ["Project table button formula"]),
    el("p", { class: "desc" }, ["Add a Formula URL field to your Project table named 'Open Gantt'. Paste this. Add the field to the form."]),
    el("div", { class: "code-block" }, [
      el("button", { class: "copy", onclick: e => copyToClipboard(buttonFormula, e.target) }, ["Copy"]),
      buttonFormula,
    ]),
  ]));

  body.appendChild(el("div", { class: "card" }, [
    el("h2", {}, ["Direct test URL"]),
    el("p", { class: "desc" }, ["Replace [YOUR_APP_DBID] and [PROJECT_RID] to test without the button. Or click below to launch with the current settings."]),
    el("div", { class: "code-block" }, [
      el("button", { class: "copy", onclick: e => copyToClipboard(directUrl, e.target) }, ["Copy"]),
      directUrl,
    ]),
  ]));

  body.appendChild(el("div", { class: "card" }, [
    el("h2", {}, ["Launch the Gantt now"]),
    el("p", { class: "desc" }, ["Test it without leaving this page. (You'll need a project record ID to filter.)"]),
    el("div", { class: "fld" }, [
      el("label", {}, ["Project record ID to test with (optional)"]),
      el("input", { type: "text", id: "wiz-launch-rid", placeholder: "e.g. 42" }),
    ]),
    el("div", { class: "card-actions" }, [
      el("button", { class: "btn", onclick: () => { Wiz.step = 3; renderWizard(); }}, ["Back"]),
      el("button", { class: "btn primary", onclick: wizLaunch }, ["Launch Gantt"]),
    ]),
  ]));
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = "Copied";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 1200);
  });
}

function wizLaunch() {
  const rid = document.getElementById("wiz-launch-rid").value.trim();
  const m = Wiz.mapping; const dm = Wiz.depMapping || {};
  const params = new URLSearchParams(window.location.search);
  params.delete("setup");
  params.set("taskdbid", Wiz.taskDbid);
  if (m.fidName) params.set("namefid", m.fidName);
  if (m.fidStart) params.set("startfid", m.fidStart);
  if (m.fidEnd) params.set("endfid", m.fidEnd);
  if (m.fidStartSave) params.set("startsavefid", m.fidStartSave);
  if (m.fidProject) params.set("projectfid", m.fidProject);
  if (m.fidStatus) params.set("statusfid", m.fidStatus);
  if (m.fidPercent) params.set("percentfid", m.fidPercent);
  if (m.fidAssigned) params.set("assignedfid", m.fidAssigned);
  if (m.fidGroup) params.set("groupfid", m.fidGroup);
  if (m.fidMilestone) params.set("milestonefid", m.fidMilestone);
  if (m.fidPriority) params.set("priorityfid", m.fidPriority);
  if (m.fidBaselineStart) params.set("baselinestartfid", m.fidBaselineStart);
  if (m.fidBaselineEnd) params.set("baselineendfid", m.fidBaselineEnd);
  if (m.fidParentTask) params.set("parentfid", m.fidParentTask);
  if (m.fidSortOrder) params.set("sortorderfid", m.fidSortOrder);
  if (m.fidWbs) params.set("wbsfid", m.fidWbs);
  if (m.fidDuration) params.set("durationfid", m.fidDuration);
  if (Wiz.depDbid) params.set("depdbid", Wiz.depDbid);
  if (dm.fidDepPred) params.set("deppredfid", dm.fidDepPred);
  if (dm.fidDepSucc) params.set("depsuccfid", dm.fidDepSucc);
  if (dm.fidDepType) params.set("deptypefid", dm.fidDepType);
  if (dm.fidDepLag) params.set("deplagfid", dm.fidDepLag);
  if (dm.fidDepProject) params.set("depprojectfid", dm.fidDepProject);
  if (rid) params.set("projectrid", rid);
  window.location.search = params.toString();
}
