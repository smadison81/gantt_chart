import State from '../state.js';
import { toast } from '../utils/notify.js';
import { updateRecords } from '../api.js';
import { pushUndo, queueChange } from '../undo.js';

// Injected by main.js
let _render = null;

export function injectHooks(render) {
  _render = render;
}

export function attachProgressDrag(handle, bar, task) {
  handle.addEventListener("pointerdown", e => {
    e.stopPropagation();
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const barRect = bar.getBoundingClientRect();
    const barW = barRect.width;

    const onMove = ev => {
      const localX = ev.clientX - barRect.left;
      const pct = Math.max(0, Math.min(100, Math.round((localX / barW) * 100)));
      handle.style.left = pct + "%";
      const fill = bar.querySelector(".pct-fill");
      if (fill) fill.style.width = pct + "%";
    };
    const onUp = ev => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      const localX = ev.clientX - barRect.left;
      const pct = Math.max(0, Math.min(100, Math.round((localX / barW) * 100)));
      const oldPct = task.percent;
      task.percent = pct;

      const { cfg } = State;
      if (!cfg.autoSave) {
        queueChange(task.rid, cfg.fidPercent, oldPct, pct);
        pushUndo({
          type: "percent", desc: `Progress ${task.name} to ${pct}%`,
          undo() { task.percent = oldPct; },
          redo() { task.percent = pct; },
        });
        toast(`${task.name}: ${pct}%`, "info");
      } else {
        pushUndo({
          type: "percent", desc: `Progress ${task.name} to ${pct}%`,
          undo() { task.percent = oldPct; },
          redo() { task.percent = pct; },
        });
        updateRecords(cfg.taskDbid, [{ [3]: { value: task.rid }, [cfg.fidPercent]: { value: pct } }], [3])
          .then(() => toast(`${task.name}: ${pct}%`, "success"))
          .catch(err => toast("Save failed: " + err.message, "error"));
      }
      if (_render) _render();
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  });
}
