export const VERSION = "1.0.0";

export const DEFAULTS = {
  pixelsPerDay: 28,
  rowHeight: 38,
  defaultWindowDays: 180,
  zoom: "week",
};

export const ZOOM_LEVELS = {
  day:     { ppd: 40, majorUnit: "week",    minorUnit: "day"     },
  week:    { ppd: 22, majorUnit: "month",   minorUnit: "week"    },
  month:   { ppd: 8,  majorUnit: "quarter", minorUnit: "month"   },
  quarter: { ppd: 3,  majorUnit: "year",    minorUnit: "quarter" },
  all:     { ppd: "auto", majorUnit: "year", minorUnit: "quarter" },
};

const State = {
  cfg: {},
  realm: window.location.hostname,
  token: "",
  schema: null,
  records: [],
  tasks: [],
  filtered: [],
  visible: [],
  groups: {},
  dependencies: [],
  resources: [],
  allocations: [],
  selectedRid: null,
  zoom: "week",
  ppd: 22,
  chartStart: null,
  chartEnd: null,
  columnOrder: ["id", "name", "dates", "status"],
  filters: {
    search: "",
    status: "",
    range: "all",
    resource: "",
    showMilestones: true,
    showLate: false,
  },
  groupBy: "none",
  showBaselines: true,
  showDeps: true,
  cascadeOnMove: false,
  showLabels: true,
  density: "default",
  theme: "light",
  undoStack: [],
  redoStack: [],
  pendingChanges: [],
  collapsedTasks: {},
  mobileView: "auto",
};

export default State;
