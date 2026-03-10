/**
 * @vex/store  — State Management
 * ══════════════════════════════════════════════════════════════
 *  Combines Redux (slices, middleware, devtools) +
 *           Zustand (simple create()) +
 *           Jotai (atoms) +
 *           MobX-style signals
 *  All in one package, zero dependencies.
 * ══════════════════════════════════════════════════════════════
 */
'use strict';

const { useSyncExternalStore } = require('../vex-core/index.js');

// ─────────────────────────────────────────────────────────────
//  SIGNAL  — reactive primitive (like MobX observable / SolidJS signal)
// ─────────────────────────────────────────────────────────────
function signal(initialValue) {
  let _value = initialValue;
  const _subs = new Set();

  const sig = {
    get value()      { return _value; },
    set value(next)  { if (!Object.is(_value, next)) { _value = next; _subs.forEach(f => f(_value)); } },
    subscribe(fn)    { _subs.add(fn); return () => _subs.delete(fn); },
    peek()           { return _value; },
    update(fn)       { sig.value = fn(_value); },
    toString()       { return String(_value); },
  };
  return sig;
}

// computed signal
function computed(fn, deps) {
  const sig = signal(fn());
  for (const dep of deps) {
    dep.subscribe(() => { sig.value = fn(); });
  }
  return { value: sig.value, subscribe: sig.subscribe.bind(sig), peek: sig.peek.bind(sig) };
}

// effect (auto-tracking not implemented — use explicit deps like useEffect)
function effect(fn) {
  fn();
  return () => {}; // cleanup noop
}

// ─────────────────────────────────────────────────────────────
//  ATOM  (Jotai-style primitive)
// ─────────────────────────────────────────────────────────────
function atom(initialValue) {
  const sig = signal(initialValue);
  sig._isAtom = true;
  return sig;
}

// ─────────────────────────────────────────────────────────────
//  CREATE STORE  (Zustand-style)
// ─────────────────────────────────────────────────────────────
function create(initializer) {
  let state;
  const listeners = new Set();

  const setState = (partial, replace) => {
    const next = typeof partial === 'function' ? partial(state) : partial;
    const updated = replace ? next : Object.assign({}, state, next);
    if (!Object.is(state, updated)) {
      state = updated;
      listeners.forEach(fn => fn(state));
    }
  };

  const getState  = () => state;
  const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  const destroy   = () => listeners.clear();

  const api = { setState, getState, subscribe, destroy };
  state = initializer(setState, getState, api);

  // React hook
  function useStore(selector) {
    const sel = selector || (s => s);
    return useSyncExternalStore(
      subscribe,
      () => sel(state),
      () => sel(state),
    );
  }
  useStore.getState  = getState;
  useStore.setState  = setState;
  useStore.subscribe = subscribe;
  useStore.destroy   = destroy;

  return useStore;
}

// ─────────────────────────────────────────────────────────────
//  SLICE  (Redux Toolkit-style)
// ─────────────────────────────────────────────────────────────
function createSlice({ name, initialState, reducers, extraReducers }) {
  const actions = {};
  const actionCreators = {};

  for (const key in reducers) {
    const type = `${name}/${key}`;
    actionCreators[key] = (payload) => ({ type, payload });
    actionCreators[key].type = type;
    actions[type] = reducers[key];
  }

  function reducer(state = initialState, action) {
    if (action.type in actions) {
      // Use immer-like mutation (simple clone approach)
      const draft = deepClone(state);
      actions[action.type](draft, action);
      return draft;
    }
    if (extraReducers) {
      const extra = typeof extraReducers === 'function'
        ? (() => { const b = new ActionBuilder(); extraReducers(b); return b._map; })()
        : extraReducers;
      if (action.type in extra) {
        const draft = deepClone(state);
        extra[action.type](draft, action);
        return draft;
      }
    }
    return state;
  }

  return { name, actions: actionCreators, reducer };
}

class ActionBuilder {
  constructor() { this._map = {}; }
  addCase(actionCreator, reducer) {
    const type = typeof actionCreator === 'string' ? actionCreator : actionCreator.type;
    this._map[type] = reducer;
    return this;
  }
  addMatcher(matcher, reducer) { return this; }
  addDefaultCase(reducer) { return this; }
}

// createAsyncThunk
function createAsyncThunk(type, payloadCreator) {
  const pending   = `${type}/pending`;
  const fulfilled = `${type}/fulfilled`;
  const rejected  = `${type}/rejected`;

  const thunk = (arg) => async (dispatch, getState) => {
    dispatch({ type: pending, payload: arg });
    try {
      const result = await payloadCreator(arg, { dispatch, getState });
      dispatch({ type: fulfilled, payload: result });
      return result;
    } catch (err) {
      dispatch({ type: rejected, payload: err?.message ?? 'error', error: true });
      throw err;
    }
  };
  thunk.pending   = { type: pending };
  thunk.fulfilled = { type: fulfilled };
  thunk.rejected  = { type: rejected };
  return thunk;
}

// ─────────────────────────────────────────────────────────────
//  CONFIGURE STORE  (Redux-style with middleware)
// ─────────────────────────────────────────────────────────────
function configureStore({ reducer, middleware, preloadedState, devTools }) {
  // Combine reducers if object
  const rootReducer = typeof reducer === 'function'
    ? reducer
    : combineReducers(reducer);

  let state = preloadedState ?? rootReducer(undefined, { type: '@@INIT' });
  const listeners = new Set();

  // Default middleware: thunk
  const defaultMiddleware = [thunkMiddleware];
  const mw = middleware
    ? (typeof middleware === 'function' ? middleware(defaultMiddleware) : middleware)
    : defaultMiddleware;

  const store = {
    getState:  () => state,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    dispatch:  null, // set below
  };

  // Build middleware chain (compose)
  const dispatch = (action) => {
    if (typeof action === 'function') {
      // thunk
      return action(store.dispatch, store.getState);
    }
    const next = state;
    state = rootReducer(state, action);
    if (state !== next) listeners.forEach(fn => fn());
    return action;
  };

  // Apply middleware
  const chain = mw.map(m => m({ getState: store.getState, dispatch }));
  store.dispatch = chain.reduceRight((next, m) => m(next), dispatch);

  // React hook
  store.useSelector = (selector) => {
    return useSyncExternalStore(store.subscribe, () => selector(state), () => selector(state));
  };
  store.useDispatch = () => store.dispatch;

  // DevTools
  if (devTools && typeof window !== 'undefined' && window.__VEX_DEVTOOLS__) {
    window.__VEX_DEVTOOLS__.connect(store);
  }

  return store;
}

// Middleware
const thunkMiddleware = ({ getState, dispatch }) => next => action => {
  if (typeof action === 'function') return action(dispatch, getState);
  return next(action);
};

const loggerMiddleware = ({ getState }) => next => action => {
  if (typeof action === 'object') {
    console.groupCollapsed?.(`[Vex Store] ${action.type}`);
    console.log('prev state', getState());
    console.log('action', action);
  }
  const result = next(action);
  if (typeof action === 'object') {
    console.log('next state', getState());
    console.groupEnd?.();
  }
  return result;
};

function combineReducers(reducers) {
  return function combination(state = {}, action) {
    let changed = false;
    const next = {};
    for (const key in reducers) {
      const prev = state[key];
      const n    = reducers[key](prev, action);
      next[key]  = n;
      if (n !== prev) changed = true;
    }
    return changed ? next : state;
  };
}

// ─────────────────────────────────────────────────────────────
//  useSelector / useDispatch  (standalone hooks)
// ─────────────────────────────────────────────────────────────
let _defaultStore = null;
function setDefaultStore(store) { _defaultStore = store; }
function useSelector(selector) { return _defaultStore?.useSelector(selector); }
function useDispatch() { return _defaultStore?.dispatch; }

// ─────────────────────────────────────────────────────────────
//  UTILITY
// ─────────────────────────────────────────────────────────────
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepClone);
  const out = {};
  for (const k in obj) out[k] = deepClone(obj[k]);
  return out;
}

// ─────────────────────────────────────────────────────────────
//  EXPORTS
// ─────────────────────────────────────────────────────────────
module.exports = {
  signal, computed, effect, atom,
  create,
  createSlice, createAsyncThunk, configureStore, combineReducers,
  thunkMiddleware, loggerMiddleware,
  useSelector, useDispatch, setDefaultStore,
};
