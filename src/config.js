import State, { ZOOM_LEVELS } from './state.js';

export function getParam(name) {
  return new URLSearchParams(window.location.search).get(name) || "";
}

export function getBoolParam(name, fallback = false) {
  const v = getParam(name);
  if (!v) return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

export function getNumParam(name, fallback = 0) {
  const v = getParam(name);
  if (!v) return fallback;
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

export function isMobile() {
  return window.innerWidth <= 768;
}

export function detectMobileView() {
  if (State.mobileView === "cards") return true;
  if (State.mobileView === "gantt") return false;
  return isMobile();
}

export function loadConfig() {
  const cfg = {
    taskDbid:        getParam("taskdbid"),
    fidName:         getNumParam("namefid"),
    fidStart:        getNumParam("startfid"),
    fidEnd:          getNumParam("endfid"),
    fidProject:      getNumParam("projectfid"),
    projectRid:      getParam("projectrid"),
    fidStartSave:    getNumParam("startsavefid"),
    fidStatus:       getNumParam("statusfid"),
    fidPercent:      getNumParam("percentfid"),
    fidGroup:        getNumParam("groupfid"),
    fidAssigned:     getNumParam("assignedfid"),
    fidMilestone:    getNumParam("milestonefid"),
    fidPriority:     getNumParam("priorityfid"),
    fidParentTask:   getNumParam("parentfid"),
    fidSortOrder:    getNumParam("sortorderfid"),
    fidWbs:          getNumParam("wbsfid"),
    fidDuration:     getNumParam("durationfid"),
    fidBaselineStart: getNumParam("baselinestartfid"),
    fidBaselineEnd:   getNumParam("baselineendfid"),
    depDbid:         getParam("depdbid"),
    fidDepPred:      getNumParam("deppredfid"),
    fidDepSucc:      getNumParam("depsuccfid"),
    fidDepLag:       getNumParam("deplagfid"),
    fidDepProject:   getNumParam("depprojectfid"),
    fidDepType:      getNumParam("deptypefid"),
    appToken:        getParam("apptoken"),
    allowDrag:       getBoolParam("drag", true),
    allowResize:     getBoolParam("resize", true),
    title:           getParam("title") || "Project Gantt",
    pageId:          getParam("pageid") || getParam("pid") || "",
    initialZoom:     getParam("zoom") || "week",
    pixelsPerDay:    getNumParam("ppd", 0),
    readOnly:        getBoolParam("readonly", false),
    autoSave:        getBoolParam("autosave", true),
    skipWeekends:    getBoolParam("skipweekends", true),
    holidays:        getParam("holidays"),
  };
  State.cfg = cfg;
  State.zoom = ZOOM_LEVELS[cfg.initialZoom] ? cfg.initialZoom : "week";
  State.ppd = cfg.pixelsPerDay || ZOOM_LEVELS[State.zoom].ppd;
}
