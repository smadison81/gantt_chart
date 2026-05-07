# QB Gantt Plugin vs Our Gantt: Gap Analysis

## Where We Beat the Plugin

| Feature | Plugin | Ours | Why Ours Wins |
|---|---|---|---|
| Setup complexity | 11 required tables, rigid schema | 1 table, 3 fields minimum, wizard auto-maps | Dramatically easier adoption |
| Account tier | Business/Enterprise only | Any tier (code page or external) | Accessible to all QB users |
| Save model | Batch save (click Save or lose work) | Per-task auto-save on drag/edit | No lost work on browser crash |
| Manual save option | No | Yes (autosave=0, queue + batch) | Flexibility for both workflows |
| Read-only mode | No dedicated mode | readonly=1 param | Safe sharing with view-only users |
| Drag to reorder rows | No | Yes (grip handle, updates sort order) | Quick reprioritization |
| CSV export | No (XLSX only) | Yes | Lighter, no Excel dependency |
| Prev/next timeline nav | Yes | Yes | Parity |
| Working on any schema | Must match exact field structure | Works with whatever fields you have | Retrofit into any existing app |

## Where We Match (Parity)

| Feature | Status |
|---|---|
| Task bars with drag to move | Done |
| Resize handles (both ends) | Done |
| All 4 dependency types (FS, SS, FF, SF) | Done |
| Drag to create dependencies | Done |
| Dependency management in task editor | Done |
| Delete dependencies | Done |
| Baseline comparison bars | Done |
| Critical path highlighting | Done |
| Undo / Redo with keyboard shortcuts | Done |
| Task hierarchy (parent/child, expand/collapse) | Done |
| Summary bar rollup (dates, percent) | Done |
| Inline cell editing (double-click) | Done |
| Zoom in/out (5 levels) | Done |
| Zoom to Fit ("All" mode) | Done |
| Working-day calendar (skip weekends/holidays) | Done |
| Non-working time shading | Done |
| Task labels toggle | Done |
| Progress bar fill | Done |
| Progress drag (handle on bar fill) | Done |
| Filters (search, status, time range) | Done |
| Group by (status, group field, assigned) | Done |
| Settings persistence across sessions | Done |
| Today line | Done |
| Milestones (diamond markers) | Done |
| Dependency violation warnings | Done |
| Cascade on move (shift successors) | Done |
| Status colors | Done |
| Toast notifications | Done |

## What's Missing (Plugin Has, We Don't)

### Tier 1: High-Impact, Reasonable Effort

| # | Feature | What the plugin does | Effort |
|---|---|---|---|
| 1 | **Create task from Gantt** | "Create" button adds a new task row inline, saves to QB | ~60 lines |
| 2 | **Expand All / Collapse All** | Toolbar buttons to expand or collapse entire hierarchy at once | ~15 lines |
| 3 | **Fullscreen mode** | Button toggles browser fullscreen via Fullscreen API | ~15 lines |
| 4 | **Right-click context menu** | Add task above/below, add/remove dependencies, delete task | ~80 lines |
| 5 | **XLSX export** | Downloads as Excel instead of CSV | ~40 lines (needs SheetJS or build xlsx manually) |
| 6 | **Column reorder (drag headers)** | Drag column headers to rearrange the list grid | ~60 lines |
| 7 | **Delete task from Gantt** | Remove a task record directly without leaving the Gantt | ~30 lines |

### Tier 2: Medium-Impact, Moderate Effort

| # | Feature | What the plugin does | Effort |
|---|---|---|---|
| 8 | **Tabbed task editor** | General / Predecessors / Successors / Resources / Advanced / Notes tabs | ~120 lines (upgrade quick edit to tabbed) |
| 9 | **Progress lines** | Vertical lines on timeline showing schedule progress at a date | ~40 lines |
| 10 | **Lag/lead on dep creation** | When drawing a dependency, prompt for type + lag (not just default FS) | ~30 lines |
| 11 | **Row height setting** | User-configurable row height from settings menu | ~20 lines |
| 12 | **Multiple baselines** | Baseline 1, 2, 3 snapshots for comparing schedule versions | ~50 lines |
| 13 | **Time ranges on timeline** | Custom date ranges (sprints, phases) displayed as shaded bands | ~50 lines |

### Tier 3: Big Lift, Plugin's Core Differentiator

| # | Feature | What the plugin does | Effort |
|---|---|---|---|
| 14 | **Scheduling engine** | Auto-schedule: moving a predecessor cascades all downstream tasks respecting types, lag, calendars, and constraints. Fixed Duration / Fixed Effort / Fixed Units modes | ~300 lines (we have basic cascade, plugin has full Bryntum engine) |
| 15 | **Constraint types** | Must Start On, Must Finish On, Start No Earlier Than, Start No Later Than, Finish No Earlier/Later Than | ~100 lines (needs new fields + UI) |
| 16 | **Resource management** | Resources table, assignment table, resource-aware scheduling, effort-driven duration | ~200 lines + new table/fields |
| 17 | **Task segments (split tasks)** | Split a task into non-contiguous segments when work is interrupted | ~150 lines + new table |
| 18 | **Effort-driven scheduling** | Duration auto-adjusts when resources are added/removed | Part of #14/#16 |

## Summary Scorecard

| Category | Plugin | Ours |
|---|---|---|
| Features matched | -- | 28/28 core features at parity |
| Features we beat them on | 0 | 8 advantages |
| Missing (easy, Tier 1) | 7 | 0 done |
| Missing (medium, Tier 2) | 6 | 0 done |
| Missing (big lift, Tier 3) | 5 | 0 done |
| Setup time for new app | 30-60 min (11 tables) | 5 min (wizard) |
| Account requirement | Business/Enterprise | Any |

## Recommended Priority

**Quick wins (knock out in one session):**
1. Create task from Gantt (#1)
2. Expand All / Collapse All (#2)
3. Fullscreen (#3)
4. Delete task (#7)

**Next session:**
5. Right-click context menu (#4)
6. Lag/lead prompt on dep draw (#10)
7. Row height setting (#11)

**Later:**
8. Tabbed task editor (#8)
9. Progress lines (#9)
10. Multiple baselines (#12)

**Probably never (diminishing returns):**
- Full scheduling engine (#14): Bryntum spent years on this. Our cascade-on-move covers 80% of real use cases.
- Resource management (#16): Requires new tables, and most QB users manage resources via the platform's native forms, not the Gantt.
- Task segments (#17): Rare use case.
