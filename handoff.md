# Quickbase Gantt Code Page — Project Context

This document is a complete handoff for Claude Code (or any new assistant) picking up work on the Quickbase Gantt project. Read it end to end before making changes. Every architectural decision and bug pattern below was paid for in real debugging time, so don't reinvent.

---

## 1. What We're Building

A **single self-contained HTML file** that runs as a Quickbase code page (or an externally hosted page that points at a QB realm). It's a Gantt chart over a Tasks table — drag to move, drag handles to resize, baseline ghost bars, milestones, status colors, dependencies, critical path, today line, multiple zoom levels.

**The product goal:** drop-in replacement for Quickbase's native Gantt plugin with **dramatically less setup**. The plugin needs an 11-table template app. Ours needs a Tasks table with three fields (Name, Start Date, End Date) and auto-detects everything else via a setup wizard.

**Stage:** working prototype, side project. Used internally first, possibly distributed externally later.

---

## 2. The User: Stephen Madison

Quickbase consultant at Customer_Acceleration_Group. Deep platform expert — does NOT need basics explained (formulas, pipelines, FIDs, table relationships, code pages, REST API). Communication style is non-negotiable:

- **No em dashes ever.** Use commas, colons, semicolons.
- Plain language. No jargon, no fake-sounding "I'm thrilled to help" energy.
- No disclaimers, no "as an AI" hedging, no apologies.
- Direct, sequenced instructions. Don't pad responses with scaffolding.
- Acknowledge mistakes briefly and fix them. Don't grovel.
- Three follow-up questions formatted exactly as `**Q1:**` `**Q2:**` `**Q3:**` at the end of every response.
- He gets visibly frustrated when bugs persist across multiple turns. If a bug is recurring, stop iterating and read the actual code carefully before guessing again.

---

## 3. Current File State

Single file. Working version lives at `/mnt/user-data/outputs/qb-gantt.html` after every meaningful change.

- ~2,527 lines, ~98 KB
- Self-contained: HTML + CSS + JS in one file, no external dependencies
- Loads via temp-token auth using the user's QB session cookie

Approximate structure:
- Lines 1-400: HTML head + CSS variables + layout CSS
- Lines 400-800: Constants (DEFAULTS, ZOOM_LEVELS, State object, config parsing)
- Lines 800-1100: Render shell, toolbar, filter bar, status bar
- Lines 1100-1500: List rendering, timeline rendering, row rendering (the Gantt core)
- Lines 1500-1800: Drag handlers, save logic, zoom controls
- Lines 1800-2100: Quick edit panel, dependencies, validation
- Lines 2100-2527: Setup wizard, schema introspection, init

---

## 4. Architecture (the parts that matter)

### 4.1 URL-driven config
One HTML file works in any QB app. The button formula on a Project record passes all the field IDs:

```
"https://yourrealm.quickbase.com/db/CODE_PAGE_DBID?a=dbpage&pagename=qb-gantt&"
& "taskdbid=" & [Task DBID]
& "&namefid=6&startfid=8&endfid=9&statusfid=10&percentfid=25"
& "&projectfid=12&projectid=" & [Record ID#]
```

Every field mapping is a URL param. The wizard generates this formula for you.

### 4.2 Setup wizard mode
`?setup=true` triggers a wizard. It calls `/v1/fields?tableId=X` to introspect the schema, smart-matches field labels to known patterns ("start date", "end date", "status", "% complete", etc.), shows the user the proposed mapping, then generates the button formula they paste into a Project table.

### 4.3 Auth
Uses `/v1/auth/temporary/{dbid}` with `credentials: include`. The user's QB session cookie travels along, so they're authed automatically. Token refreshes automatically on 401. NO user-pasted tokens, NO hardcoded credentials, NO API keys in the page.

### 4.4 Two-pane scroll architecture (CRITICAL — DO NOT REVERT)
After multiple wrong attempts, the layout that works is:

```
.main (grid: leftw 6px 1fr; overflow: hidden; height calc(100vh - 130px))
├── .left (flex column, overflow: hidden)
│   ├── .list-head (fixed height, flex-shrink: 0)
│   └── .list-body (flex: 1, overflow-y: auto, overflow-x: hidden)
├── .divider-cell (drag to resize panels)
└── .right (flex column, overflow: hidden)
    ├── .timeline-head (fixed height, overflow: hidden)
    │   └── .timeline-head-inner (transformed via JS to track horizontal scroll)
    └── .timeline-scroll (flex: 1, overflow: auto BOTH directions)
        └── .timeline-inner (position: relative, contains all row divs)
```

Why this matters: the timeline-scroll's horizontal scrollbar sits at the bottom of the **visible viewport**, not at the bottom of all the rows (which could be 5000px down). Earlier attempts used a single grid with `overflow-y: auto` on `.main`, which put the horizontal scrollbar way below the visible area, making the chart appear "compressed."

**Vertical sync** between `list-body.scrollTop` and `timeline-scroll.scrollTop` is done via JS in `renderTimeline()` using a `syncing` flag and `requestAnimationFrame` to break re-entry.

### 4.5 Row stacking (CRITICAL BUG PATTERN — READ THIS)
**Rows in both panels stack via natural document flow.** Do NOT set `top: idx * 38` on rows.

`.tl-row` and `.list-row` both have `position: relative; height: 38px`. When you set `top: N` on a position-relative element, it shifts the element DOWN by N pixels FROM ITS NATURAL FLOW POSITION. So if row 5 is naturally at y=190 (5 × 38) and you set `top: 190`, it renders at y=380 (double the expected position). Each row drifts further down.

Earlier code did exactly this. The list rows naturally stacked correctly while the timeline rows doubled their offsets, so the bar in row 5 appeared horizontally aligned with list row 10. Looked like a date-mapping bug, was actually a CSS bug.

**Correct pattern:**
- Rows: `position: relative; height: 38px;` no `top` set
- Bars inside rows: `position: absolute; left: X; width: W;` no `top` for vertical (vertical is fixed at `top: 8px`)
- Both panels iterate `State.visible` in the same order, both use the same row height, alignment is automatic

### 4.6 Date save pattern
Write to `startsavefid` ONLY (NOT to both `startfid` and `startsavefid`). The pattern:

1. User drags bar
2. `saveTaskDates(task, newStart, newEnd)` POSTs to `/v1/records` writing `fidStartSave` and `fidEnd` only
3. Optimistic local update: `task.start = newStart; task.end = newEnd`
4. `applyFilters()` re-renders (no server reload, which would cause snap-back)
5. Format MUST be YYYY-MM-DD regardless of display format

**`mapTask` reads `displayStart || editableStart`** so newly saved tasks render at the correct position even before any formula recalc on the server side.

### 4.7 Drag tooltip
Floating dark tooltip follows the cursor during any drag/resize. Reads bar's current pixel position and converts back to dates using `chartStart + Math.round(left / ppd)`. So the displayed dates always match what would be saved on release. Cleaned up on `pointerup` and `pointercancel`.

---

## 5. Test App: Project Management Gantt Chart

This is the new app for testing the Gantt. NOT the same as the DePuy app (which is a different consulting context entirely).

**App:** `bvz9c3tgj` (DBID), realm `customer_acceleration_group.quickbase.com`
**Owner:** Stephen Madison

### Tables and their DBIDs

| Table | DBID | Purpose |
|---|---|---|
| Projects | `bvz9c3tnn` | Parent project records |
| Tasks | `bvz9c3tt7` | Gantt rows (the table the Gantt points at) |
| Milestones | `bvz9c3tvm` | Project-level checkpoints |
| Resources | `bvz9c3txk` | Resource pool (people, equipment, software) |
| Resource Allocation | `bvz9c3t37` | Junction: which resources on which tasks |
| Clients | `bvz9c3t75` | Customer records |
| Users | `bvz9c3ucn` | Internal staff (separate from QB user accounts) |

### Tasks table FIDs (the Gantt's primary table)

| FID | Field | Type | Notes |
|---|---|---|---|
| 6 | Task Name | Text | The bar label |
| 7 | Task Description | Text Multi-line | |
| 8 | Start Date | Date | Editable, used for both display AND save |
| 9 | End Date | Date | Editable |
| 10 | Status | Multiple Choice Text | Not Started, In Progress, Complete, Blocked, Cancelled |
| 11 | Priority | Multiple Choice Text | Low, Medium, High, Critical |
| 12 | Related Project | Numeric | Reference to Projects |
| 13 | Related Assigned To | Numeric | Reference to Users |
| 22 | Phase | Multiple Choice Text | Initiation through Closeout |
| 23 | Baseline Start | Date | For ghost bar comparison |
| 24 | Baseline End | Date | |
| 25 | Percent Complete | Numeric | 0-100, drives progress fill |
| 27 | Is Milestone | Checkbox | Renders as diamond if true |
| 28 | Duration | Formula Numeric | Read-only |
| 29 | Is Late | Formula Checkbox | Read-only |

### Test data CSVs

Generated and located at `/mnt/user-data/outputs/`:

```
01_users.csv          (20 users)
02_clients.csv        (15 clients)
03_resources.csv      (25 resources)
04_projects.csv       (30 projects, spread Sep 2025 to Mar 2027)
05_tasks.csv          (673 tasks, 15-30 per project)
06_milestones.csv     (187 milestones, 4-8 per project)
07_resource_allocations.csv (871 allocations)
```

**Import order is mandatory** because Quickbase auto-assigns sequential Record IDs and the relationship FKs in later files reference earlier files' RIDs. Generator script: `/home/claude/gendata.py` (recreate from this if needed).

---

## 6. The Other Test App (DePuy work, separate context)

There's a parallel project for client DePuy Synthes (J&J medical device) using a different Quickbase app for actual PPM consulting. That work is mostly orthogonal to the Gantt code page — but the DePuy app was the original test bed before we built the dedicated Gantt Test app. Mentioning here so you don't conflate them.

- **App:** `bvx6j9yjb` on `scdemo.quickbase.com`
- **Token:** `c5zvgjwbd92hz7cdw6xk2up4ia8`
- **Tasks table:** `bvx6j9yjm`
- **Test URL params used historically:** `namefid=42` (Phase Name), `startfid=9`, `endfid=25`, `startsavefid=83`, `projectfid=69`, `statusfid=8`, `percentfid=92`, `assignedfid=4`, `milestonefid=51`

**Critical quirk on the DePuy app:** FID 9 is a formula-derived display Start Date, FID 83 is the editable Start Date. Saves must go to FID 83 only. After save, FID 9 takes a few seconds to recalculate. This is what drove the `displayStart || editableStart` fallback pattern in `mapTask`. The new Gantt Test App does NOT have this split — Start Date is FID 8, plain editable, no formula.

---

## 7. Key Features Currently Working

- ✅ URL-driven config with all field mappings
- ✅ Setup wizard with schema introspection and auto-mapping
- ✅ Drag to move bars (writes to QB)
- ✅ Resize handles on both ends (writes to QB)
- ✅ Live drag tooltip showing new dates as you drag
- ✅ Five zoom levels: Day / Week / Month / Quarter / All
- ✅ "All" zoom auto-fits ppd to viewport width
- ✅ Today line with "TODAY" label
- ✅ Weekend shading (only at day zoom)
- ✅ Baseline ghost bars (when baseline fields configured)
- ✅ Critical path computation (dependency-driven)
- ✅ Dependency arrows + violation warnings (when dependency table configured)
- ✅ Cascade-on-move (shifts dependent successors)
- ✅ Validation: detects orphan tasks, missing dates, dependency violations
- ✅ Filters: search, status, time range, late-only, milestones-only
- ✅ Group-by: status, group field, assigned-to
- ✅ Status colors: Not Started gray, In Progress orange, Complete green, Blocked red, Late dark red
- ✅ Color legend in filter bar
- ✅ Selected row highlights both panels (3px accent border + soft blue fill)
- ✅ Bidirectional vertical scroll sync between list and timeline
- ✅ Resizable left panel (drag the divider)
- ✅ Resizable Name and Dates columns
- ✅ Column widths persist via URL params (`leftw`, `colname`, `coldates`)
- ✅ Quick edit panel (double-click a bar)
- ✅ Status bar with task counts and validation summary
- ✅ Toast notifications for save success/failure
- ✅ Keyboard shortcuts: 1-5 = zoom levels

---

## 8. Bugs We've Fixed (don't recreate them)

### 8.1 The `top: idx * 38` row drift bug
Already covered in section 4.5. **Burned hours on this** because the symptom looked like date math being wrong. Always check CSS positioning before assuming date math is the issue.

### 8.2 Boot order: render() before chartStart was set
`render()` was called before `loadTasks()`, with `chartStart=null`, causing `diffDays(null, null)` to throw. Fixed by initializing `chartStart`/`chartEnd` defaults in init AND removing the premature render call.

### 8.3 Date format: must be YYYY-MM-DD regardless of locale
The REST API rejects MM/DD/YYYY. UI displays MM/DD/YYYY but save calls always format as YYYY-MM-DD. Don't break this.

### 8.4 Variable shadowing in wizCollectMapping
`el()` helper (the DOM creation function) was shadowed inside `wizCollectMapping` by a local variable named `el`. Renamed local to `node`. Watch for this if adding new DOM-heavy functions.

### 8.5 Save snap-back when fidStart is a formula
Writing to BOTH `fidStart` and `fidStartSave` causes the save to silently fail on the formula field, and a subsequent server reload would pull the OLD (still computing) value back into the local task object, snapping the bar back. Fix: write to `fidStartSave` ONLY, mutate `task.start` and `task.end` locally, do NOT reload from server after save.

### 8.6 "Not Started" matching as "in-progress"
The status detector used `s.includes("started")` which matched both "Not Started" and "Started". Fixed by checking "not started" / "pending" / "planning" branches FIRST, then progress/active.

### 8.7 Height math: 100vh - 86px was wrong
Toolbar (56) + filterbar (44) + statusbar (30) = 130px, not 86. Fix: `.main { height: calc(100vh - 130px) }`. If you change those bar heights, update this.

### 8.8 Wizard variable shadowing the DOM helper
Same family as 8.4. Be careful naming local variables `el`, `state`, `cfg`, etc., when there are globals with the same names.

---

## 9. Quickbase API Knowledge

Quirks that took time to learn:

- **Date format for save:** `YYYY-MM-DD`. Display can be anything; save must be ISO.
- **Reference fields store value, not Record ID:** Some reference fields (especially in the DePuy app like Financial Models FID 6) store the proxy text value (e.g., a project ID string), NOT the Record ID#. When querying with `where`, match on text equality (`{6.EX.'PROJ-001'}`) not record ID.
- **Newly created Record IDs:** retrieve from `response.json.metadata.createdRecordIds[0]`, NOT from the data array.
- **Pipeline response accessor:** `.json` (e.g., `model.json.data`), not `.body`.
- **Query result limiting:** `"options": {"skip": 0, "top": 1}`. There is no separate `limit` parameter.
- **Pipeline account contexts:** Triggers use the realm-prefixed format `quickbase[MbAXDg9#scdemo]`. Action steps use just the account name `quickbase[6re5WRG]`.
- **Trigger syntax:** `record on_update` for checkbox-driven pipelines, `record on_create` for creation triggers. Don't confuse these.
- **Formula field rules:** Variables cannot have integers in their names. Use `Length()` not `Len()`. `IsNull()` only works on non-text fields (use `=""` for text).
- **Formula buttons:** Use direct URL `href` patterns. Don't bother with `onclick` JavaScript — QB's renderer strips most of it. The Gantt code page button passes URL params and that's it.
- **The button resets its own checkbox:** When using a "Generate X" checkbox-driven pipeline, the API_EditRecord call from the button URL clears the checkbox automatically. No separate reset step needed.

---

## 10. What's Next / Pending Work

In rough priority order:

### 10.1 Distribution
Currently a code page. Future options:
- **GitHub Pages or Netlify hosting** with the same file. Pros: one-place updates, version control. Cons: cross-site cookie behavior for the temp-token endpoint needs testing across browsers.
- **Iframe-embed back into QB** for that "feels native" UX with external hosting benefits.
- **Marketplace listing** if this becomes a real product.

### 10.2 Plugin parity items still missing
The QB Gantt plugin has these; we don't yet:
- **Resource leveling.** Algorithm: detect over-allocation, suggest reassignment or schedule shift. Needs Resource Allocation table data.
- **Working-time calendars.** Skip weekends/holidays in duration math. Currently we just shade weekends visually.
- **Multiple baselines per task.** Currently single baseline. Plugin supports baseline 1, 2, 3.
- **MS Project import/export.** XML round-trip. Big lift.

### 10.3 Performance
~200ms lag on drag-release with 1000+ tasks because the whole timeline re-renders. Should profile and only re-render the affected row. Acceptable for typical projects, noticeable on stress tests.

### 10.4 Code protection
Discussed but not implemented. Recommended: minify with `html-minifier-terser`, add copyright header. Real protection (server-side algorithms) only matters when there's actual proprietary logic to hide, which we don't have yet.

### 10.5 UX polish ideas Stephen has surfaced
- Scroll-to-task on row click (auto-scroll horizontal to bring selected task into view)
- Today column band (subtle vertical fill across all rows at today's date, on top of the line)
- Drag tooltip dependency violation warnings during drag
- Search highlighting (matched text gets a yellow background)

---

## 11. How to Update the File

Working copy: `/home/claude/gantt/qb-gantt.html` (gets edited)
Output copy: `/mnt/user-data/outputs/qb-gantt.html` (what the user downloads)

Pattern:
1. Edit `/home/claude/gantt/qb-gantt.html` using `str_replace`
2. Verify JS parses: `node -e "const fs=require('fs'); const h=fs.readFileSync('/home/claude/gantt/qb-gantt.html','utf8'); const m=h.match(/<script>([\s\S]*?)<\/script>/); new Function(m[1]); console.log('OK', h.split('\n').length, 'lines');"`
3. Copy to outputs: `cp /home/claude/gantt/qb-gantt.html /mnt/user-data/outputs/qb-gantt.html`
4. Present file to user via the present_files tool

Stephen will hard refresh (Ctrl+Shift+R) on the QB code page to pick up changes.

---

## 12. State Object Reference (the key globals)

```js
State = {
  cfg: {},                  // Parsed URL config + wizard mapping
  realm: "...",
  token: "...",             // Temp token from /v1/auth/temporary
  tasks: [],                // Array of mapped task objects (see mapTask below)
  visible: [],              // Filtered + grouped subset rendered as rows
  dependencies: [],         // [{pred, succ, type, lag}, ...]
  selectedRid: null,        // Currently selected task RID
  zoom: "week",             // "day"|"week"|"month"|"quarter"|"all"
  ppd: 22,                  // Pixels per day (computed from zoom or fit)
  chartStart: Date,         // Earliest date shown (visible chart range)
  chartEnd: Date,           // Latest date shown
  filters: {
    search: "",
    status: "",
    range: "all",
    showLate: false,
    showMilestones: false,
  },
  groupBy: "none",          // "none"|"status"|"group"|"assigned"
  groups: {},               // Collapsed state per group key
  showBaselines: false,
  showDeps: true,
  cascadeOnMove: false,
  _scrollLeft: null,        // Persisted across re-renders
  _scrollTop: null,
};
```

Each task in `State.tasks` (output of `mapTask`):
```js
{
  rid: 123,
  name: "Design API",
  start: Date,              // From displayStart || editableStart
  end: Date,
  status: "In Progress",
  percent: 45,
  isMilestone: false,
  baselineStart: Date|null,
  baselineEnd: Date|null,
  group: "...",
  assigned: "...",
  // ...other fields read from URL config
}
```

---

## 13. Setup Flow for a New QB App

For a user who wants to install the Gantt on their app:

1. **Create the code page** in their QB app: paste the entire HTML file as a code page named `qb-gantt`.
2. **Open in setup mode:** `https://realm.quickbase.com/db/APP_DBID?a=dbpage&pagename=qb-gantt&setup=true`
3. **Wizard introspects the schema:** user picks the Tasks table, wizard auto-maps fields by label.
4. **Wizard generates the button formula** for the Project (or whatever parent) table:
   ```
   "https://realm.quickbase.com/db/APP_DBID?a=dbpage&pagename=qb-gantt"
   & "&taskdbid=TASK_DBID&namefid=6&startfid=8&endfid=9&statusfid=10&..."
   ```
5. **User adds the formula URL field** to the parent table, then clicks the button on any record to launch the Gantt for that record's tasks.

---

## 14. Things Stephen Has Said To Look Out For

- "I don't want disclaimers about being AI" — never write "as an AI", "I'm just a model", etc.
- "No em dashes" — comma, colon, or semicolon. Watch every single response for this.
- "Don't make me repeat myself" — if I asked for X earlier in the conversation, remember it. Search past conversations if uncertain.
- "Look at the actual code before guessing" — if a fix didn't work, the next step is `view` on the relevant function, not another guess.
- "I want all the functionality the QB Gantt plugin has" — when in doubt about a feature priority, mirror what the plugin does.

---

## 15. Skipped / Out of Scope

- **Microsoft Project bi-directional sync.** Massive effort, not worth it for a side project.
- **Server-side resource leveling.** Would require a backend. Keep client-side.
- **OAuth flow.** Temp-token via session cookie is sufficient for code-page deployment.
- **Heavy obfuscation.** Just minification + copyright header. Real IP protection needs server-side logic, which we don't have.

---

## End of Context

If you're picking this up cold: read sections 4.4 and 4.5 twice. Most bugs we hit are layout/positioning issues, not logic issues.
