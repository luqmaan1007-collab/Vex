#!/usr/bin/env node
/**
 * Vex test suite
 * Run: node test/run.js
 */
'use strict';

const path = require('path');
const root = path.join(__dirname, '..');

let passed = 0, failed = 0;
function ok(label)      { console.log('  ✓', label); passed++; }
function fail(label, e) { console.log('  ✗', label, String(e?.message ?? e)); failed++; }
function section(s)     { console.log(`\n── ${s} ──`); }

// ─────────────────────────────────────────────────────────────
//  vex-core
// ─────────────────────────────────────────────────────────────
section('vex-core');
const V = require(path.join(root, 'packages/vex-core/index.js'));

try { const el = V.createElement('div', {className:'a'}, 'hi'); if (el.type !== 'div' || el.props.className !== 'a') throw 'bad'; ok('createElement'); } catch(e) { fail('createElement', e); }
try { if (!V.isValidElement(V.createElement('span',null))) throw 'valid'; if (V.isValidElement('x')) throw 'invalid string'; ok('isValidElement'); } catch(e) { fail('isValidElement', e); }
try { const c = V.cloneElement(V.createElement('div',{a:1}), {b:2}); if (c.props.a !== 1 || c.props.b !== 2) throw 'props'; ok('cloneElement'); } catch(e) { fail('cloneElement', e); }
try { const ctx = V.createContext(99); if (ctx._currentValue !== 99 || !ctx.Provider || !ctx.Consumer) throw 'ctx'; ok('createContext'); } catch(e) { fail('createContext', e); }
try { const r = V.createRef(); if (r.current !== null) throw 'null'; r.current = 5; if (r.current !== 5) throw 'assign'; ok('createRef'); } catch(e) { fail('createRef', e); }
try { const m = V.memo(() => null); if (m.$$typeof.toString().indexOf('memo') === -1) throw m.$$typeof; ok('memo'); } catch(e) { fail('memo', e); }
try { const fr = V.forwardRef((p,r) => null); if (fr.$$typeof.toString().indexOf('forward') === -1) throw fr.$$typeof; ok('forwardRef'); } catch(e) { fail('forwardRef', e); }
try {
  const html = V.renderToString(V.createElement('div', {className:'app'},
    V.createElement('h1', null, '<Hello>'),
    V.createElement('input', {type:'text', disabled:true})
  ));
  if (!html.includes('class="app"')) throw 'className';
  if (!html.includes('&lt;Hello&gt;')) throw 'escaping';
  if (!html.includes('<input')) throw 'input';
  if (html.includes('</input>')) throw 'void close';
  ok('renderToString SSR');
} catch(e) { fail('renderToString', e); }
try { const ch = [V.createElement('a',{key:'x'}), V.createElement('b',{key:'y'})]; if (V.Children.count(ch) !== 2) throw 'count'; ok('Children'); } catch(e) { fail('Children', e); }
try {
  const p = V.createPortal(V.createElement('div',null,'modal'), {mock:'container'});
  if (!p.props.children) throw 'no children';
  ok('createPortal');
} catch(e) { fail('createPortal', e); }
try { const L = V.lazy(() => Promise.resolve({ default: ()=>null })); if (!L._payload) throw 'payload'; ok('lazy'); } catch(e) { fail('lazy', e); }
try {
  const root2 = V.createRoot({ appendChild(){}, insertBefore(){}, removeChild(){} });
  if (!root2.render || !root2.unmount) throw 'no render/unmount';
  ok('createRoot API');
} catch(e) { fail('createRoot', e); }

// ─────────────────────────────────────────────────────────────
//  vex-store
// ─────────────────────────────────────────────────────────────
section('vex-store');
const S = require(path.join(root, 'packages/vex-store/index.js'));

try {
  const count = S.signal(0);
  if (count.value !== 0) throw 'initial';
  count.value = 5;
  if (count.value !== 5) throw 'set';
  let got = null;
  const unsub = count.subscribe(v => got = v);
  count.value = 10;
  if (got !== 10) throw 'subscribe: got ' + got;
  unsub();
  count.value = 99;
  if (got !== 10) throw 'unsubscribe did not work';
  ok('signal');
} catch(e) { fail('signal', e); }

try {
  const a = S.atom(42);
  if (a.value !== 42) throw 'initial';
  a.update(x => x * 2);
  if (a.value !== 84) throw 'update: ' + a.value;
  ok('atom + update');
} catch(e) { fail('atom', e); }

try {
  const slice = S.createSlice({
    name: 'counter',
    initialState: { n: 0 },
    reducers: {
      inc: (s, a) => { s.n += (a.payload ?? 1); },
      reset: (s) => { s.n = 0; },
    }
  });
  if (!slice.actions.inc || !slice.reducer) throw 'missing';
  let state = slice.reducer(undefined, { type: '@@INIT' });
  state = slice.reducer(state, slice.actions.inc(5));
  if (state.n !== 5) throw 'n=' + state.n;
  state = slice.reducer(state, slice.actions.reset());
  if (state.n !== 0) throw 'reset n=' + state.n;
  ok('createSlice');
} catch(e) { fail('createSlice', e); }

try {
  const store = S.configureStore({
    reducer: { count: (s=0, a) => a.type === 'INC' ? s+1 : s },
  });
  store.dispatch({ type: 'INC' });
  store.dispatch({ type: 'INC' });
  if (store.getState().count !== 2) throw 'count=' + store.getState().count;
  ok('configureStore + dispatch');
} catch(e) { fail('configureStore', e); }

try {
  const use = S.create((set) => ({
    x: 0,
    inc: () => set(s => ({ x: s.x + 1 })),
  }));
  if (use.getState().x !== 0) throw 'init';
  use.getState().inc();
  if (use.getState().x !== 1) throw 'after inc: ' + use.getState().x;
  ok('create (Zustand-style)');
} catch(e) { fail('create', e); }

// ─────────────────────────────────────────────────────────────
//  vex-router
// ─────────────────────────────────────────────────────────────
section('vex-router');
const R = require(path.join(root, 'packages/vex-router/index.js'));

try {
  const m = R.matchPath('/user/:id', '/user/42');
  if (!m || m.params.id !== '42') throw JSON.stringify(m);
  ok('matchPath :param');
} catch(e) { fail('matchPath :param', e); }

try {
  const m = R.matchPath('/a/b/c', '/a/b/c');
  if (!m) throw 'no match';
  ok('matchPath exact');
} catch(e) { fail('matchPath exact', e); }

try {
  const m = R.matchPath('/user/:id', '/other/path');
  if (m) throw 'should not match';
  ok('matchPath no match');
} catch(e) { fail('matchPath no match', e); }

try {
  const hist = R.createMemoryHistory(['/home', '/about']);
  if (hist.location.pathname !== '/about') throw hist.location.pathname;
  hist.push('/contact');
  if (hist.location.pathname !== '/contact') throw hist.location.pathname;
  hist.back();
  if (hist.location.pathname !== '/about') throw 'back: ' + hist.location.pathname;
  ok('createMemoryHistory');
} catch(e) { fail('createMemoryHistory', e); }

// ─────────────────────────────────────────────────────────────
//  transpiler
// ─────────────────────────────────────────────────────────────
section('transpiler');
try {
  const { transpile } = require(path.join(root, 'transpiler/vex.js'));
  if (typeof transpile !== 'function') throw 'no transpile export';
  ok('transpiler loads');
} catch(e) { fail('transpiler loads', e); }

try {
  const { transpile } = require(path.join(root, 'transpiler/vex.js'));
  const { js } = transpile('fn add(a, b) { return a + b }', 'test.vx');
  if (!js.includes('function') && !js.includes('=>')) throw 'no function in output: ' + js.slice(0,100);
  ok('transpiler: fn → function');
} catch(e) { fail('transpiler fn', e); }

try {
  const { transpile } = require(path.join(root, 'transpiler/vex.js'));
  const { js } = transpile('let x = 1 + 2', 'test.vx');
  if (!js.includes('1') || !js.includes('2')) throw js;
  ok('transpiler: expression');
} catch(e) { fail('transpiler expression', e); }

// ─────────────────────────────────────────────────────────────
//  Results
// ─────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`);
console.log(`  ${passed + failed} tests: ${passed} ✓  ${failed} ✗`);
if (failed === 0) {
  console.log('  ✅  ALL TESTS PASS — Vex is ready for GitHub!\n');
} else {
  console.log(`  ❌  ${failed} test(s) failed\n`);
  process.exit(1);
    }
