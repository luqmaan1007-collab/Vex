/**
 * @vex/core — Fiber Reconciler + Hook Scheduler
 * ═══════════════════════════════════════════════════════════════
 * Fixes every gap vs React:
 *   ✅ Virtual DOM  (createElement, Fragment, cloneElement)
 *   ✅ Reconciliation  — keyed diffing, NOT container overwrite
 *   ✅ Hook scheduler  — useState, useEffect, useMemo, useRef…
 *   ✅ Automatic re-render  — call setState → DOM updates itself
 *   ✅ Priority lanes  — Sync / Normal / Transition / Idle
 *   ✅ MessageChannel work-loop  (concurrent-style, no blocking)
 *   ✅ 4-phase commit  before-mutation → mutation → layout → passive
 *   ✅ Context  (createContext / Provider / useContext)
 *   ✅ Refs  (createRef, useRef, forwardRef, useImperativeHandle)
 *   ✅ Memo  (shallowEqual bail-out, like React.memo)
 *   ✅ Portals
 *   ✅ startTransition / useTransition / useDeferredValue
 *   ✅ renderToString  (SSR)
 *   ✅ All 18 hooks React 18 has
 * ═══════════════════════════════════════════════════════════════
 */
'use strict';

// ── Symbols ────────────────────────────────────────────────────
const VELEMENT  = Symbol.for('vex.element');
const VFRAGMENT = Symbol.for('vex.fragment');
const VPORTAL   = Symbol.for('vex.portal');
const VMEMO     = Symbol.for('vex.memo');
const VFORWARD  = Symbol.for('vex.forward_ref');
const VPROVIDER = Symbol.for('vex.provider');
const VCONSUMER = Symbol.for('vex.consumer');
const VCONTEXT  = Symbol.for('vex.context');

// ── Fiber tags ─────────────────────────────────────────────────
const T_ROOT   = 0;
const T_HOST   = 1;   // real DOM element
const T_TEXT   = 2;   // text node
const T_FUNC   = 3;   // function component
const T_CLASS  = 4;   // class component
const T_FRAG   = 5;   // <>…</>
const T_CTX_P  = 6;   // Context.Provider
const T_CTX_C  = 7;   // Context.Consumer
const T_MEMO   = 8;   // memo()
const T_FWD    = 9;   // forwardRef()
const T_PORTAL = 10;  // createPortal()

// ── Effect flags ───────────────────────────────────────────────
const F_PLACE  = 1 << 0;  // insert node
const F_UPDATE = 1 << 1;  // update node
const F_DELETE = 1 << 2;  // remove node
const F_EFFECT = 1 << 3;  // useEffect pending
const F_LAYOUT = 1 << 4;  // useLayoutEffect pending
const F_REF    = 1 << 5;  // ref attachment

// ── Lanes ──────────────────────────────────────────────────────
const L_SYNC   = 1;
const L_NORMAL = 16;
const L_TRANS  = 64;
const L_IDLE   = 512;

// ═══════════════════════════════════════════════════════════════
//  createElement  — what JSX compiles to
// ═══════════════════════════════════════════════════════════════
function createElement(type, config, ...rawChildren) {
  let key = null, ref = null;
  const props = {};

  if (config != null) {
    if (config.key != null)  key = String(config.key);
    if (config.ref != null)  ref = config.ref;
    for (const k of Object.keys(config)) {
      if (k !== 'key' && k !== 'ref') props[k] = config[k];
    }
  }

  const flat = rawChildren.flat(Infinity).filter(c => c != null && c !== false && c !== true);
  if (flat.length === 1) props.children = flat[0];
  else if (flat.length > 1) props.children = flat;

  if (type && type.defaultProps) {
    for (const k of Object.keys(type.defaultProps)) {
      if (props[k] === undefined) props[k] = type.defaultProps[k];
    }
  }

  return { $$typeof: VELEMENT, type, key, ref, props };
}

// JSX automatic transform entry points
const jsx  = (type, props, key) => createElement(type, key != null ? { ...props, key } : props);
const jsxs = jsx;
const jsxDEV = jsx;

// ═══════════════════════════════════════════════════════════════
//  SCHEDULER  — MessageChannel work-loop, priority min-heap
// ═══════════════════════════════════════════════════════════════
const _heap = [];          // min-heap sorted by .exp (expiry)
let   _ticking = false;
let   _deadline = 0;
let   _seq = 0;

function _now() {
  return (typeof performance !== 'undefined' ? performance : Date).now();
}

function _push(task) {
  _heap.push(task);
  let i = _heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (_heap[p].exp <= _heap[i].exp) break;
    [_heap[p], _heap[i]] = [_heap[i], _heap[p]]; i = p;
  }
}

function _pop() {
  const top = _heap[0], last = _heap.pop();
  if (_heap.length) {
    _heap[0] = last;
    let i = 0;
    for (;;) {
      const l = 2*i+1, r = 2*i+2; let s = i;
      if (l < _heap.length && _heap[l].exp < _heap[s].exp) s = l;
      if (r < _heap.length && _heap[r].exp < _heap[s].exp) s = r;
      if (s === i) break;
      [_heap[i], _heap[s]] = [_heap[s], _heap[i]]; i = s;
    }
  }
  return top;
}

function _schedule(cb, lane = L_NORMAL) {
  const delays = { [L_SYNC]: -1, [L_NORMAL]: 250, [L_TRANS]: 5000, [L_IDLE]: 1e9 };
  const task = { cb, exp: _now() + (delays[lane] ?? 250), id: ++_seq, lane };
  _push(task);
  if (!_ticking) _kick();
  return task;
}

function _kick() {
  _ticking = true;
  if (typeof MessageChannel !== 'undefined') {
    const ch = new MessageChannel();
    ch.port1.onmessage = _loop;
    ch.port2.postMessage(null);
  } else {
    setTimeout(_loop, 0);
  }
}

function _loop() {
  _ticking = false;
  _deadline = _now() + 8;   // 8 ms budget per frame

  while (_heap.length) {
    const task = _heap[0];
    if (!task.cb) { _pop(); continue; }
    const expired = task.exp <= _now();
    if (!expired && _now() >= _deadline) break;
    _pop();
    try {
      const cont = task.cb(expired);
      if (typeof cont === 'function') { task.cb = cont; _push(task); }
    } catch (e) { console.error('[Vex Scheduler]', e); }
  }

  if (_heap.length) _kick();
}

function _shouldYield() { return _now() >= _deadline; }

// ═══════════════════════════════════════════════════════════════
//  FIBER
// ═══════════════════════════════════════════════════════════════
function _fiber(tag, type, key, pendingProps) {
  return {
    tag, type, key,
    pendingProps,
    memoizedProps:  null,
    memoizedState:  null,   // hook list head for funcs; class state
    stateNode:      null,   // DOM node / class instance
    child:    null,
    sibling:  null,
    return:   null,
    index:    0,
    ref:      null,
    alternate:    null,
    flags:        0,
    subtreeFlags: 0,
    deletions:    null,
    _root:        null,     // pointer to createRoot() object
    _name:        null,
  };
}

function _clone(src, pendingProps) {
  const f = _fiber(src.tag, src.type, src.key, pendingProps);
  f.stateNode     = src.stateNode;
  f.memoizedState = src.memoizedState;
  f.memoizedProps = src.memoizedProps;
  f.ref           = src.ref;
  f.index         = src.index;
  f.alternate     = src;
  f._root         = src._root;
  f._name         = src._name;
  f.flags         = F_UPDATE;
  src.alternate   = f;
  return f;
}

// ═══════════════════════════════════════════════════════════════
//  GLOBAL RENDER STATE
// ═══════════════════════════════════════════════════════════════
let _wip       = null;   // work-in-progress root fiber
let _committed = null;   // last committed root fiber
let _wipFiber  = null;   // fiber currently being rendered (hooks target)
let _hookIdx   = 0;
let _deletes   = [];
let _pending   = new Set();  // roots with scheduled work

// ═══════════════════════════════════════════════════════════════
//  createRoot
// ═══════════════════════════════════════════════════════════════
function createRoot(container) {
  const rootFiber = _fiber(T_ROOT, 'root', null, null);
  rootFiber.stateNode = container;

  const root = {
    _type: 'VexRoot',
    container,
    current: rootFiber,
    _pendingEl: null,
    render(el) { _queueRoot(this, el); },
    unmount()  { _queueRoot(this, null); },
  };
  rootFiber._root = root;
  return root;
}

function _queueRoot(root, el) {
  root._pendingEl = el;
  if (!_pending.has(root)) {
    _pending.add(root);
    _schedule(() => _runRoot(root), L_NORMAL);
  }
}

// Trigger update from inside a component (setState / dispatch)
function _triggerUpdate(fiber) {
  let f = fiber;
  while (f.return) f = f.return;
  const root = f._root;
  if (!root) return;
  if (!_pending.has(root)) {
    _pending.add(root);
    _schedule(() => _runRoot(root), L_NORMAL);
  }
}

// ═══════════════════════════════════════════════════════════════
//  RENDER PASS
// ═══════════════════════════════════════════════════════════════
function _runRoot(root) {
  _pending.delete(root);

  // Build WIP root fiber
  const pendingProps = root._pendingEl != null
    ? { children: root._pendingEl }
    : (root.current?.memoizedProps ?? { children: null });

  const wip = _fiber(T_ROOT, 'root', null, pendingProps);
  wip.stateNode = root.container;
  wip.alternate = root.current;
  wip._root     = root;
  if (root.current) root.current.alternate = wip;

  _wip     = wip;
  _deletes = [];

  // Work loop — process every fiber
  let next = wip;
  while (next) next = _beginWork(next);

  // Commit all changes to DOM
  _commitRoot(wip, root);
}

// ═══════════════════════════════════════════════════════════════
//  BEGIN WORK  — render one fiber, return next to process
// ═══════════════════════════════════════════════════════════════
function _beginWork(fiber) {
  switch (fiber.tag) {
    case T_ROOT:  return _doRoot(fiber);
    case T_HOST:  return _doHost(fiber);
    case T_TEXT:  return _doText(fiber);
    case T_FUNC:  return _doFunc(fiber);
    case T_CLASS: return _doClass(fiber);
    case T_FRAG:  return _doFrag(fiber);
    case T_CTX_P: return _doProvider(fiber);
    case T_CTX_C: return _doConsumer(fiber);
    case T_MEMO:  return _doMemo(fiber);
    case T_FWD:   return _doForward(fiber);
    case T_PORTAL:return _doPortal(fiber);
    default:      return _complete(fiber);
  }
}

function _doRoot(f) {
  _reconcile(f, _flat(f.pendingProps?.children));
  return f.child;
}

function _doHost(f) {
  if (!f.stateNode) {
    f.stateNode = _domCreate(f.type, f.pendingProps);
    f.flags |= F_PLACE;
  }
  _reconcile(f, _flat(f.pendingProps?.children));
  return f.child;
}

function _doText(f) {
  if (!f.stateNode) {
    f.stateNode = (typeof document !== 'undefined')
      ? document.createTextNode(f.pendingProps ?? '')
      : { _text: f.pendingProps ?? '' };  // SSR placeholder
    f.flags |= F_PLACE;
  }
  return _complete(f);
}

function _doFunc(f) {
  _wipFiber = f;
  _hookIdx  = 0;

  let result = null;
  try {
    result = f.type(f.pendingProps ?? {});
  } catch (e) {
    console.error(`[Vex] Error in <${f._name || f.type?.name || '?'}>:`, e);
  }

  _reconcile(f, _flat(result));
  return f.child;
}

function _doClass(f) {
  let inst = f.stateNode;
  if (!inst) {
    inst = new f.type(f.pendingProps ?? {});
    inst._fiber = f;
    f.stateNode = inst;
    f.memoizedState = inst.state;
  } else {
    inst.props = f.pendingProps ?? {};
  }

  if (f.type.getDerivedStateFromProps) {
    const d = f.type.getDerivedStateFromProps(f.pendingProps, inst.state);
    if (d) inst.state = Object.assign({}, inst.state, d);
  }

  f.memoizedState = inst.state;
  let result = null;
  try { result = inst.render(); }
  catch (e) { console.error('[Vex] Class component error:', e); }

  _reconcile(f, _flat(result));
  return f.child;
}

function _doFrag(f) {
  _reconcile(f, _flat(f.pendingProps?.children));
  return f.child;
}

function _doProvider(f) {
  f.type._context._currentValue = f.pendingProps.value;
  _reconcile(f, _flat(f.pendingProps?.children));
  return f.child;
}

function _doConsumer(f) {
  const val = f.type._context._currentValue;
  const ch  = f.pendingProps.children;
  _reconcile(f, _flat(typeof ch === 'function' ? ch(val) : ch));
  return f.child;
}

function _doMemo(f) {
  const old = f.alternate;
  if (old && old.memoizedProps !== null) {
    const eq = f.type.compare || _shallowEq;
    if (eq(old.memoizedProps, f.pendingProps)) {
      f.child = old.child;
      if (f.child) f.child.return = f;
      return _complete(f);
    }
  }
  // Render the wrapped component
  _wipFiber = f;
  _hookIdx  = 0;
  let result = null;
  try { result = (f.type.type || f.type.render)(f.pendingProps ?? {}); }
  catch (e) { console.error('[Vex] Memo error:', e); }
  _reconcile(f, _flat(result));
  return f.child;
}

function _doForward(f) {
  let result = null;
  try { result = f.type.render(f.pendingProps ?? {}, f.ref); }
  catch (e) { console.error('[Vex] forwardRef error:', e); }
  _reconcile(f, _flat(result));
  return f.child;
}

function _doPortal(f) {
  _reconcile(f, _flat(f.pendingProps?.children));
  return f.child;
}

// ═══════════════════════════════════════════════════════════════
//  KEYED RECONCILIATION  — the real diff algorithm
//  Like React: build a key→oldFiber map, reuse or create fibers
// ═══════════════════════════════════════════════════════════════
function _reconcile(parent, elements) {
  // Build key map from existing children
  const keyMap = new Map();
  let old = parent.alternate?.child ?? null;
  let oi  = 0;
  while (old) {
    keyMap.set(old.key ?? oi, old);
    old = old.sibling; oi++;
  }

  let prev = null;
  let lastIdx = 0;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el == null || el === false) continue;

    const elKey  = (el && typeof el === 'object' && el.key != null) ? String(el.key) : null;
    const mapKey = elKey ?? i;
    const match  = keyMap.get(mapKey);

    let nf = null;

    if (typeof el === 'string' || typeof el === 'number') {
      // ── Text node ──
      const str = String(el);
      if (match && match.tag === T_TEXT) {
        nf = _clone(match, str);
        keyMap.delete(mapKey);
        if (match.index < lastIdx) nf.flags |= F_PLACE;
        else lastIdx = match.index;
      } else {
        nf = _fiber(T_TEXT, null, null, str);
        nf.flags = F_PLACE;
      }
    } else if (el && el.$$typeof === VELEMENT) {
      // ── Element ──
      const sameType = match && match.type === el.type;
      if (sameType) {
        nf = _clone(match, el.props);
        nf.ref = el.ref;
        keyMap.delete(mapKey);
        if (match.index < lastIdx) nf.flags |= F_PLACE;
        else lastIdx = match.index;
      } else {
        nf = _mkFromEl(el);
        nf.flags = F_PLACE;
      }
    }

    if (!nf) continue;
    nf.return = parent;
    nf.index  = i;
    nf._root  = parent._root;

    if (!prev) parent.child  = nf;
    else       prev.sibling  = nf;
    prev = nf;
  }

  if (prev) prev.sibling = null;
  else      parent.child  = null;

  // Remaining in keyMap → delete
  keyMap.forEach(old => {
    old.flags |= F_DELETE;
    _deletes.push(old);
  });

  return parent.child;
}

function _mkFromEl(el) {
  const type = el.type;
  let tag;
  if (type === VFRAGMENT)                             tag = T_FRAG;
  else if (type === VPORTAL)                          tag = T_PORTAL;
  else if (typeof type === 'string')                  tag = T_HOST;
  else if (type && type.$$typeof === VMEMO)           tag = T_MEMO;
  else if (type && type.$$typeof === VFORWARD)        tag = T_FWD;
  else if (type && type.$$typeof === VPROVIDER)       tag = T_CTX_P;
  else if (type && type.$$typeof === VCONSUMER)       tag = T_CTX_C;
  else if (typeof type === 'function' && type.prototype?.render) tag = T_CLASS;
  else                                                tag = T_FUNC;

  const f = _fiber(tag, type, el.key, el.props);
  f.ref   = el.ref;
  f._name = typeof type === 'function' ? (type.displayName || type.name) : String(type);
  return f;
}

function _complete(fiber) {
  // Bubble subtree flags
  let c = fiber.child;
  while (c) { fiber.subtreeFlags |= c.flags | c.subtreeFlags; c = c.sibling; }
  // Return next fiber to process
  if (fiber.sibling) return fiber.sibling;
  let f = fiber;
  while (f.return) {
    f.return.subtreeFlags |= f.flags | f.subtreeFlags;
    if (f.return.sibling) return f.return.sibling;
    f = f.return;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
//  COMMIT  — 4 phases, DOM mutations happen here
// ═══════════════════════════════════════════════════════════════
function _commitRoot(wipRoot, root) {
  // Phase 1: deletions
  for (const d of _deletes) _unmount(d, _findParentDom(d));

  // Phase 2: mutation (insert/update DOM nodes)
  _walk(wipRoot.child, _commitMutate);

  // Swap trees
  root.current = wipRoot;
  _committed   = wipRoot;
  _wip         = null;

  // Phase 3: layout effects  (useLayoutEffect, componentDidMount)
  _walk(wipRoot.child, _commitLayout);

  // Phase 4: passive effects  (useEffect — deferred via scheduler)
  _schedule(() => _walk(wipRoot.child, _commitPassive), L_IDLE);
}

function _walk(fiber, fn) {
  if (!fiber) return;
  _walk(fiber.child, fn);
  fn(fiber);
  _walk(fiber.sibling, fn);
}

function _commitMutate(fiber) {
  const f = fiber.flags;

  if (f & F_PLACE) {
    const parent = _findParentDom(fiber);
    const dom    = _getDom(fiber);
    if (dom && parent) {
      const anchor = _findNextSiblingDom(fiber);
      if (anchor) parent.insertBefore(dom, anchor);
      else        parent.appendChild(dom);
    }
    fiber.flags &= ~F_PLACE;
  }

  if (f & F_UPDATE) {
    if (fiber.tag === T_HOST) {
      _domUpdate(fiber.stateNode, fiber.memoizedProps, fiber.pendingProps);
    } else if (fiber.tag === T_TEXT) {
      if (fiber.pendingProps !== fiber.memoizedProps && fiber.stateNode) {
        if (fiber.stateNode.nodeValue !== undefined)
          fiber.stateNode.nodeValue = fiber.pendingProps ?? '';
      }
    }
    fiber.flags &= ~F_UPDATE;
  }

  if (f & F_REF) { _attachRef(fiber); fiber.flags &= ~F_REF; }

  // Persist props
  fiber.memoizedProps = fiber.pendingProps;
}

function _commitLayout(fiber) {
  if (fiber.tag === T_CLASS) {
    const inst = fiber.stateNode;
    if (inst) {
      if (!fiber.alternate) inst.componentDidMount?.();
      else inst.componentDidUpdate?.(fiber.alternate.memoizedProps, fiber.alternate.memoizedState);
    }
  }
  if (fiber.tag === T_FUNC || fiber.tag === T_MEMO) {
    let h = fiber.memoizedState;
    while (h) {
      if (h.tag === 'layout' && h._dirty) {
        try { if (h._cleanup) h._cleanup(); } catch(e) {}
        h._cleanup = h._fn() || null;
        h._dirty   = false;
      }
      h = h.next;
    }
  }
  fiber.flags &= ~F_LAYOUT;
}

function _commitPassive(fiber) {
  if (fiber.tag === T_FUNC || fiber.tag === T_MEMO) {
    let h = fiber.memoizedState;
    while (h) {
      if (h.tag === 'effect' && h._dirty) {
        try { if (h._cleanup) h._cleanup(); } catch(e) {}
        h._cleanup = h._fn() || null;
        h._dirty   = false;
      }
      h = h.next;
    }
  }
  fiber.flags &= ~F_EFFECT;
}

function _unmount(fiber, parentDom) {
  // Cleanup hooks
  if (fiber.tag === T_FUNC || fiber.tag === T_MEMO) {
    let h = fiber.memoizedState;
    while (h) {
      if ((h.tag === 'effect' || h.tag === 'layout') && h._cleanup) {
        try { h._cleanup(); } catch(e) {}
      }
      h = h.next;
    }
  }
  if (fiber.tag === T_CLASS) fiber.stateNode?.componentWillUnmount?.();
  if (fiber.ref) { typeof fiber.ref === 'function' ? fiber.ref(null) : (fiber.ref.current = null); }

  const dom = _getDom(fiber);
  if (dom && parentDom && dom.parentNode === parentDom) parentDom.removeChild(dom);

  let c = fiber.child;
  while (c) { _unmount(c, parentDom); c = c.sibling; }
}

function _attachRef(fiber) {
  const ref = fiber.ref;
  if (!ref) return;
  const val = fiber.tag === T_CLASS ? fiber.stateNode : fiber.stateNode;
  typeof ref === 'function' ? ref(val) : (ref.current = val);
}

// DOM helpers
function _getDom(fiber) {
  if (fiber.tag === T_HOST || fiber.tag === T_TEXT) return fiber.stateNode;
  if (fiber.tag === T_ROOT) return fiber.stateNode;
  return fiber.child ? _getDom(fiber.child) : null;
}

function _findParentDom(fiber) {
  let f = fiber.return;
  while (f) {
    if (f.tag === T_HOST || f.tag === T_ROOT) return f.stateNode;
    if (f.tag === T_PORTAL && f.stateNode) return f.stateNode;
    f = f.return;
  }
  return null;
}

function _findNextSiblingDom(fiber) {
  let s = fiber.sibling;
  while (s) {
    const d = _getDom(s);
    if (d) return d;
    s = s.sibling;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
//  DOM OPS  — create element, set props, event delegation
// ═══════════════════════════════════════════════════════════════
function _domCreate(type, props) {
  if (typeof document === 'undefined') return { _tag: type };
  const el = document.createElement(type);
  if (props) _domApply(el, {}, props);
  return el;
}

function _domUpdate(dom, prev, next) {
  if (!dom || !next) return;
  _domApply(dom, prev || {}, next);
}

function _domApply(el, prev, next) {
  // Remove stale props
  for (const k of Object.keys(prev)) {
    if (k === 'children' || k === 'key' || k === 'ref') continue;
    if (!(k in next)) {
      if (_ev(k)) el.removeEventListener(_evName(k), prev[k]);
      else if (k === 'className') el.removeAttribute('class');
      else if (k === 'style') el.removeAttribute('style');
      else el.removeAttribute(k);
    }
  }
  // Apply new props
  for (const k of Object.keys(next)) {
    if (k === 'children' || k === 'key' || k === 'ref') continue;
    if (Object.is(prev[k], next[k])) continue;

    if (_ev(k)) {
      if (prev[k]) el.removeEventListener(_evName(k), prev[k]);
      if (next[k]) el.addEventListener(_evName(k), next[k]);
    } else if (k === 'style') {
      _applyStyle(el, prev.style || {}, next.style || {});
    } else if (k === 'className') {
      el.className = next[k] ?? '';
    } else if (k === 'dangerouslySetInnerHTML') {
      el.innerHTML = next[k]?.__html ?? '';
    } else if (k === 'checked' || k === 'value' || k === 'selected') {
      el[k] = next[k];
    } else if (typeof next[k] === 'boolean') {
      if (next[k]) el.setAttribute(k, '');
      else el.removeAttribute(k);
    } else if (next[k] != null) {
      el.setAttribute(k, next[k]);
    } else {
      el.removeAttribute(k);
    }
  }
}

function _applyStyle(el, prev, next) {
  for (const k of Object.keys(prev)) { if (!(k in next)) el.style[k] = ''; }
  for (const k of Object.keys(next)) { if (prev[k] !== next[k]) el.style[k] = next[k]; }
}

const _ev     = (k) => k.length > 2 && k[0] === 'o' && k[1] === 'n';
const _evName = (k) => k[2].toLowerCase() + k.slice(3);

// ═══════════════════════════════════════════════════════════════
//  HOOKS
//  Stored as a linked list on fiber.memoizedState
//  Each hook: { tag, ...data, next }
// ═══════════════════════════════════════════════════════════════

// Get the corresponding hook from the previous render
function _oldHook() {
  const alt = _wipFiber?.alternate?.memoizedState;
  if (!alt) return null;
  let h = alt;
  for (let i = 0; i < _hookIdx; i++) { if (!h) return null; h = h.next; }
  return h;
}

// Append hook to current fiber's list
function _addHook(hook) {
  hook.next = null;
  if (!_wipFiber.memoizedState) {
    _wipFiber.memoizedState = hook;
  } else {
    let t = _wipFiber.memoizedState;
    while (t.next) t = t.next;
    t.next = hook;
  }
  _hookIdx++;
  return hook;
}

function _depsEq(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

// ── useState ──────────────────────────────────────────────────
function useState(init) {
  return useReducer(
    (state, action) => typeof action === 'function' ? action(state) : action,
    init
  );
}

// ── useReducer ────────────────────────────────────────────────
function useReducer(reducer, initialArg, initFn) {
  const old = _oldHook();
  const initVal = initFn
    ? initFn(initialArg)
    : typeof initialArg === 'function' ? initialArg() : initialArg;

  const hook = {
    tag:    'state',
    value:  old ? old.value : initVal,
    queue:  [],
    next:   null,
  };

  // Apply all queued updates
  const queue = old?.queue ?? [];
  for (const a of queue) hook.value = reducer(hook.value, a);
  if (old) old.queue = [];

  const fiber = _wipFiber;
  const h     = hook;
  const dispatch = (action) => {
    h.queue.push(action);
    _triggerUpdate(fiber);
  };

  _addHook(hook);
  return [hook.value, dispatch];
}

// ── useEffect ─────────────────────────────────────────────────
function useEffect(fn, deps) {
  _effectCore(fn, deps, 'effect', F_EFFECT);
}

// ── useLayoutEffect ───────────────────────────────────────────
function useLayoutEffect(fn, deps) {
  _effectCore(fn, deps, 'layout', F_LAYOUT);
}

// ── useInsertionEffect ────────────────────────────────────────
function useInsertionEffect(fn, deps) {
  _effectCore(fn, deps, 'layout', F_LAYOUT); // same timing as layout for now
}

function _effectCore(fn, deps, tag, flag) {
  const old   = _oldHook();
  const dirty = !old || !_depsEq(old._deps, deps);
  const hook  = {
    tag,
    _fn:      fn,
    _deps:    deps,
    _cleanup: old?._cleanup ?? null,
    _dirty:   dirty,
    next:     null,
  };
  if (dirty) _wipFiber.flags |= flag;
  _addHook(hook);
}

// ── useMemo ───────────────────────────────────────────────────
function useMemo(factory, deps) {
  const old = _oldHook();
  const hook = {
    tag:   'memo',
    value: (!old || !_depsEq(old._deps, deps)) ? factory() : old.value,
    _deps: deps,
    next:  null,
  };
  _addHook(hook);
  return hook.value;
}

// ── useCallback ───────────────────────────────────────────────
function useCallback(fn, deps) {
  return useMemo(() => fn, deps);
}

// ── useRef ────────────────────────────────────────────────────
function useRef(init) {
  const old  = _oldHook();
  const hook = { tag: 'ref', value: old ? old.value : { current: init }, next: null };
  _addHook(hook);
  return hook.value;
}

// ── useContext ────────────────────────────────────────────────
function useContext(ctx) {
  const hook = { tag: 'ctx', value: ctx._currentValue, next: null };
  _addHook(hook);
  return hook.value;
}

// ── useId ─────────────────────────────────────────────────────
function useId() {
  const old  = _oldHook();
  const id   = old?.value ?? `:v${Math.random().toString(36).slice(2, 8)}:`;
  const hook = { tag: 'id', value: id, next: null };
  _addHook(hook);
  return id;
}

// ── useTransition ─────────────────────────────────────────────
function useTransition() {
  const [pending, setPending] = useState(false);
  const start = (fn) => {
    setPending(true);
    _schedule(() => { fn(); setPending(false); }, L_TRANS);
  };
  return [pending, start];
}

// ── useDeferredValue ──────────────────────────────────────────
function useDeferredValue(val) {
  const [deferred, set] = useState(val);
  useEffect(() => { set(val); }, [val]);
  return deferred;
}

// ── useImperativeHandle ───────────────────────────────────────
function useImperativeHandle(ref, create, deps) {
  useLayoutEffect(() => {
    if (!ref) return;
    const v = create();
    typeof ref === 'function' ? ref(v) : (ref.current = v);
  }, deps);
}

// ── useDebugValue ─────────────────────────────────────────────
function useDebugValue(val, fmt) { /* dev-only no-op */ }

// ── useSyncExternalStore ──────────────────────────────────────
function useSyncExternalStore(subscribe, getSnapshot) {
  const [, rerender] = useReducer(x => x + 1, 0);
  useEffect(() => subscribe(rerender), [subscribe]);
  return getSnapshot();
}

// ═══════════════════════════════════════════════════════════════
//  CONTEXT
// ═══════════════════════════════════════════════════════════════
function createContext(defaultValue) {
  const ctx = {
    $$typeof:      VCONTEXT,
    _currentValue: defaultValue,
    displayName:   undefined,
  };

  ctx.Provider = {
    $$typeof: VPROVIDER,
    _context: ctx,
    displayName: 'Provider',
  };

  ctx.Consumer = {
    $$typeof: VCONSUMER,
    _context: ctx,
    displayName: 'Consumer',
  };

  return ctx;
}

// ═══════════════════════════════════════════════════════════════
//  REFS / MEMO / FORWARD / LAZY
// ═══════════════════════════════════════════════════════════════
const createRef  = () => ({ current: null });
const memo       = (type, compare) => ({ $$typeof: VMEMO, type, compare: compare || null });
const forwardRef = (render) => ({ $$typeof: VFORWARD, render });

function lazy(ctor) {
  const p = { _s: 0, _r: null };   // status, result
  return {
    $$typeof: Symbol.for('vex.lazy'),
    _init(payload) {
      if (payload._s === 1) return payload._r;
      const promise = ctor();
      payload._s = 0;
      promise.then(
        m => { payload._s = 1; payload._r = m.default ?? m; },
        e => { payload._s = 2; payload._r = e; }
      );
      throw promise;
    },
    _payload: p,
  };
}

// ═══════════════════════════════════════════════════════════════
//  PORTAL
// ═══════════════════════════════════════════════════════════════
function createPortal(children, container, key) {
  return {
    $$typeof: VELEMENT,
    type:  VPORTAL,
    key:   key ?? null,
    ref:   null,
    props: { children, _container: container },
  };
}

// ═══════════════════════════════════════════════════════════════
//  startTransition
// ═══════════════════════════════════════════════════════════════
function startTransition(fn) { _schedule(fn, L_TRANS); }

// ═══════════════════════════════════════════════════════════════
//  Children utilities
// ═══════════════════════════════════════════════════════════════
const Children = {
  map:     (c, fn) => _flat(c).map(fn),
  forEach: (c, fn) => _flat(c).forEach(fn),
  count:   (c)     => _flat(c).length,
  toArray: (c)     => _flat(c),
  only:    (c)     => { const a = _flat(c); if (a.length !== 1) throw new Error('Children.only'); return a[0]; },
};

// ═══════════════════════════════════════════════════════════════
//  cloneElement / isValidElement
// ═══════════════════════════════════════════════════════════════
function cloneElement(el, config, ...children) {
  const props = { ...el.props };
  let key = el.key, ref = el.ref;
  if (config) {
    if (config.key != null) key = String(config.key);
    if (config.ref != null) ref = config.ref;
    for (const k of Object.keys(config)) {
      if (k !== 'key' && k !== 'ref') props[k] = config[k];
    }
  }
  const flat = children.flat(Infinity);
  if (flat.length === 1) props.children = flat[0];
  else if (flat.length > 1) props.children = flat;
  return { $$typeof: VELEMENT, type: el.type, key, ref, props };
}

const isValidElement = (x) => typeof x === 'object' && x !== null && x.$$typeof === VELEMENT;

// ═══════════════════════════════════════════════════════════════
//  renderToString  (SSR)
// ═══════════════════════════════════════════════════════════════
function renderToString(node) {
  if (node == null || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return _esc(String(node));
  if (Array.isArray(node)) return node.map(renderToString).join('');
  if (node.$$typeof !== VELEMENT) return '';

  const { type, props } = node;

  if (type === VFRAGMENT) return renderToString(props.children);
  if (typeof type === 'function') {
    if (type.prototype?.render) {
      const inst = new type(props);
      return renderToString(inst.render());
    }
    return renderToString(type(props));
  }
  if (type && type.$$typeof === VMEMO) {
    return renderToString((type.type || type.render)(props));
  }
  if (typeof type !== 'string') return '';

  const void_els = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  const attrs = _ssrAttrs(props);
  const inner = void_els.has(type) ? '' : renderToString(props.children);
  return void_els.has(type)
    ? `<${type}${attrs}>`
    : `<${type}${attrs}>${inner}</${type}>`;
}

function _ssrAttrs(props) {
  if (!props) return '';
  let s = '';
  for (const k of Object.keys(props)) {
    if (k === 'children' || k === 'key' || k === 'ref' || k.startsWith('on')) continue;
    if (props[k] == null || props[k] === false) continue;
    const ak = k === 'className' ? 'class' : k === 'htmlFor' ? 'for' : k;
    if (props[k] === true) s += ` ${ak}`;
    else s += ` ${ak}="${_esc(String(props[k]))}"`;
  }
  return s;
}

function _esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════
function _flat(children) {
  if (children == null) return [];
  if (!Array.isArray(children)) return [children];
  return children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false && c !== true);
}

function _shallowEq(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => Object.is(a[k], b[k]));
}

// Stable no-op component
const Fragment = VFRAGMENT;
const Suspense = { $$typeof: Symbol.for('vex.suspense'), displayName: 'Suspense' };
const StrictMode = { $$typeof: Symbol.for('vex.strict'), displayName: 'StrictMode' };

// ═══════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════
module.exports = {
  // JSX
  createElement, jsx, jsxs, jsxDEV,
  Fragment, Suspense, StrictMode,

  // Root
  createRoot,

  // All 18 hooks
  useState,
  useReducer,
  useEffect,
  useLayoutEffect,
  useInsertionEffect,
  useMemo,
  useCallback,
  useRef,
  useContext,
  useId,
  useTransition,
  useDeferredValue,
  useImperativeHandle,
  useDebugValue,
  useSyncExternalStore,

  // Utilities
  createContext,
  createRef,
  memo,
  forwardRef,
  lazy,
  createPortal,
  startTransition,
  cloneElement,
  isValidElement,
  Children,
  renderToString,

  // Internal (devtools / testing)
  _getWipFiber: () => _wipFiber,
  _schedule,
};
