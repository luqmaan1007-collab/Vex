/**
 * @vex/devtools  — Developer Tools
 * Hot reload, component tree inspector, time-travel debugger
 * Inject into page via: import '@vex/devtools'
 */
'use strict';

// ── Time-travel store ──────────────────────────────────────────
const history = [];
let cursor = -1;

function record(snapshot) {
  history.splice(cursor + 1);
  history.push({ snapshot, timestamp: Date.now() });
  cursor = history.length - 1;
}

function undo() {
  if (cursor <= 0) return null;
  cursor--;
  return history[cursor].snapshot;
}

function redo() {
  if (cursor >= history.length - 1) return null;
  cursor++;
  return history[cursor].snapshot;
}

// ── Console pretty-printer ────────────────────────────────────
function inspect(fiber, depth = 0) {
  if (!fiber) return;
  const indent = '  '.repeat(depth);
  const name   = fiber._name || fiber.type?.name || fiber.tag;
  const flags  = fiber.flags ? ` [${fiber.flags}]` : '';
  console.log(`${indent}<${name}>${flags}`);
  inspect(fiber.child, depth + 1);
  inspect(fiber.sibling, depth);
}

// ── Hot reload stub (works with Vite/webpack HMR) ─────────────
function enableHMR(acceptFn) {
  if (typeof module !== 'undefined' && module.hot) {
    module.hot.accept(acceptFn);
  }
}

// ── Performance profiler ──────────────────────────────────────
const _timings = [];

function startProfiling() {
  _timings.length = 0;
  console.time('[Vex] render');
}

function stopProfiling() {
  console.timeEnd('[Vex] render');
  return [..._timings];
}

function recordTiming(name, ms) {
  _timings.push({ name, ms, ts: Date.now() });
}

// ── Global hook for browser devtools extension ────────────────
if (typeof window !== 'undefined') {
  window.__VEX_DEVTOOLS__ = {
    version: '0.1.0',
    history,
    record,
    undo,
    redo,
    inspect,
    startProfiling,
    stopProfiling,
    connect(store) {
      store.subscribe(() => record(store.getState()));
    },
  };
}

module.exports = { record, undo, redo, inspect, enableHMR, startProfiling, stopProfiling, recordTiming };
