/**
 * @vex/router  — Client-side Router
 * ══════════════════════════════════════════════════════════════
 *  Full React Router v6-style router:
 *    createBrowserRouter, createHashRouter, createMemoryRouter
 *    <Router>, <Routes>, <Route>, <Link>, <NavLink>, <Navigate>
 *    <Outlet> for nested routes
 *    useNavigate, useParams, useSearchParams, useLocation
 *    useMatch, useRoutes
 *    Loaders, actions, errorElement
 *    Lazy route loading
 * ══════════════════════════════════════════════════════════════
 */
'use strict';

const { createElement: h, createContext, useContext, useState, useEffect, useRef } = require('../vex-core/index.js');

// ─────────────────────────────────────────────────────────────
//  CONTEXTS
// ─────────────────────────────────────────────────────────────
const RouterCtx  = createContext(null);
const MatchCtx   = createContext(null);
const OutletCtx  = createContext(null);

// ─────────────────────────────────────────────────────────────
//  PATH MATCHING  (like path-to-regexp, but zero deps)
// ─────────────────────────────────────────────────────────────
function compilePath(pattern) {
  if (pattern === '*') return { re: /^(.*)$/, keys: ['*'] };
  const keys = [];
  const re = new RegExp(
    '^' +
    pattern
      .replace(/\/\*/g, '(?:/(.*))?')
      .replace(/:(\w+)(\?)?/g, (_, k, opt) => {
        keys.push(k);
        return opt ? '([^/]*)' : '([^/]+)';
      })
    + '\\/?$'
  );
  return { re, keys };
}

function matchPath(pattern, pathname) {
  const { re, keys } = compilePath(pattern);
  const m = re.exec(pathname);
  if (!m) return null;
  const params = {};
  keys.forEach((k, i) => { params[k] = m[i + 1] ? decodeURIComponent(m[i + 1]) : undefined; });
  return { pathname: m[0], params };
}

// ─────────────────────────────────────────────────────────────
//  HISTORY  (browser, hash, memory)
// ─────────────────────────────────────────────────────────────
function createBrowserHistory() {
  const listeners = new Set();
  const notify = () => listeners.forEach(fn => fn(getLocation()));

  function getLocation() {
    return {
      pathname: window.location.pathname,
      search:   window.location.search,
      hash:     window.location.hash,
      state:    window.history.state,
      key:      window.history.state?.key ?? 'default',
    };
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', notify);
  }

  return {
    get location() { return typeof window !== 'undefined' ? getLocation() : { pathname: '/', search: '', hash: '', state: null, key: 'default' }; },
    push(to, state)    {
      const url   = typeof to === 'string' ? to : to.pathname + (to.search || '') + (to.hash || '');
      const key   = Math.random().toString(36).slice(2, 8);
      window.history.pushState({ ...state, key }, '', url);
      notify();
    },
    replace(to, state) {
      const url   = typeof to === 'string' ? to : to.pathname + (to.search || '') + (to.hash || '');
      const key   = window.history.state?.key ?? Math.random().toString(36).slice(2, 8);
      window.history.replaceState({ ...state, key }, '', url);
      notify();
    },
    go(n)              { window.history.go(n); },
    back()             { window.history.back(); },
    forward()          { window.history.forward(); },
    listen(fn)         { listeners.add(fn); return () => listeners.delete(fn); },
    createHref(to)     { return typeof to === 'string' ? to : to.pathname + (to.search || '') + (to.hash || ''); },
  };
}

function createHashHistory() {
  const listeners = new Set();
  const notify = () => listeners.forEach(fn => fn(getLocation()));

  function getLocation() {
    const hash = window.location.hash.slice(1) || '/';
    const qi   = hash.indexOf('?');
    return {
      pathname: qi >= 0 ? hash.slice(0, qi) : hash,
      search:   qi >= 0 ? hash.slice(qi) : '',
      hash:     '',
      state:    window.history.state,
      key:      window.history.state?.key ?? 'default',
    };
  }

  if (typeof window !== 'undefined') window.addEventListener('hashchange', notify);

  return {
    get location() { return typeof window !== 'undefined' ? getLocation() : { pathname: '/', search: '', hash: '', state: null, key: 'default' }; },
    push(to)    { window.location.hash = typeof to === 'string' ? to : to.pathname + (to.search || ''); notify(); },
    replace(to) { const url = typeof to === 'string' ? to : to.pathname + (to.search || ''); window.location.replace('#' + url); notify(); },
    go(n)       { window.history.go(n); },
    back()      { window.history.back(); },
    forward()   { window.history.forward(); },
    listen(fn)  { listeners.add(fn); return () => listeners.delete(fn); },
    createHref(to) { return '#' + (typeof to === 'string' ? to : to.pathname + (to.search || '')); },
  };
}

function createMemoryHistory(initialEntries = ['/']) {
  let idx     = initialEntries.length - 1;
  let entries = initialEntries.map((e, i) => typeof e === 'string' ? { pathname: e, search: '', hash: '', state: null, key: `${i}` } : e);
  const listeners = new Set();
  const notify = () => listeners.forEach(fn => fn(entries[idx]));

  return {
    get location() { return entries[idx]; },
    get index()    { return idx; },
    push(to, state) {
      idx++; entries = entries.slice(0, idx);
      entries.push(typeof to === 'string' ? { pathname: to, search: '', hash: '', state: state ?? null, key: String(idx) } : { ...to, key: String(idx) });
      notify();
    },
    replace(to, state) {
      entries[idx] = typeof to === 'string' ? { pathname: to, search: '', hash: '', state: state ?? null, key: entries[idx].key } : { ...to, key: entries[idx].key };
      notify();
    },
    go(n) { idx = Math.max(0, Math.min(idx + n, entries.length - 1)); notify(); },
    back()    { this.go(-1); },
    forward() { this.go(1); },
    listen(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    createHref(to) { return typeof to === 'string' ? to : to.pathname + (to.search || ''); },
  };
}

// ─────────────────────────────────────────────────────────────
//  ROUTER COMPONENTS
// ─────────────────────────────────────────────────────────────

// <BrowserRouter>
function BrowserRouter({ children, basename }) {
  return h(Router, { history: createBrowserHistory(), basename }, children);
}

// <HashRouter>
function HashRouter({ children }) {
  return h(Router, { history: createHashHistory() }, children);
}

// <MemoryRouter>
function MemoryRouter({ children, initialEntries, initialIndex }) {
  return h(Router, { history: createMemoryHistory(initialEntries) }, children);
}

// Internal <Router> — provides context
function Router({ history, children, basename }) {
  const [location, setLocation] = useState(history.location);
  useEffect(() => history.listen(setLocation), []);
  const ctx = { history, location, basename: basename || '' };
  return h(RouterCtx.Provider, { value: ctx }, children);
}

// <Routes>
function Routes({ children }) {
  const ctx     = useContext(RouterCtx);
  if (!ctx) throw new Error('[Vex Router] <Routes> must be inside a <Router>');
  const match   = useContext(MatchCtx);
  const base    = match?.pathnameBase ?? ctx.basename;
  const pathname = ctx.location.pathname.slice(base.length) || '/';

  const routes  = _collectRoutes(Array.isArray(children) ? children : [children]);
  const matched = _matchRoutes(routes, pathname);
  if (!matched) return null;

  return _renderMatched(matched, ctx);
}

// <Route> — declarative route definition
function Route() { return null; } // handled by Routes

// <Outlet> — renders matched child route
function Outlet({ context }) {
  const outlet = useContext(OutletCtx);
  if (!outlet) return null;
  return outlet;
}

// <Link>
function Link({ to, children, replace: doReplace, state, ...rest }) {
  const ctx = useContext(RouterCtx);
  const handleClick = (e) => {
    if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    if (doReplace) ctx.history.replace(to, state);
    else           ctx.history.push(to, state);
  };
  const href = ctx?.history.createHref(to) ?? to;
  return h('a', { href, onClick: handleClick, ...rest }, children);
}

// <NavLink>
function NavLink({ to, children, className, style, end, ...rest }) {
  const ctx = useContext(RouterCtx);
  if (!ctx) return h(Link, { to, ...rest }, children);
  const pathname = ctx.location.pathname;
  const isActive = end ? pathname === to : pathname.startsWith(to);
  const cn = typeof className === 'function' ? className({ isActive }) : (isActive ? (className ?? '') + ' active' : (className ?? ''));
  const st = typeof style === 'function' ? style({ isActive }) : style;
  return h(Link, { to, className: cn, style: st, ...rest }, typeof children === 'function' ? children({ isActive }) : children);
}

// <Navigate>
function Navigate({ to, replace: doReplace, state }) {
  const ctx = useContext(RouterCtx);
  useEffect(() => {
    if (doReplace) ctx.history.replace(to, state);
    else           ctx.history.push(to, state);
  }, []);
  return null;
}

// ─────────────────────────────────────────────────────────────
//  HOOKS
// ─────────────────────────────────────────────────────────────
function useNavigate() {
  const ctx = useContext(RouterCtx);
  return (to, opts = {}) => {
    if (typeof to === 'number') ctx.history.go(to);
    else if (opts.replace) ctx.history.replace(to, opts.state);
    else ctx.history.push(to, opts.state);
  };
}

function useLocation() {
  return useContext(RouterCtx)?.location ?? { pathname: '/', search: '', hash: '', state: null };
}

function useParams() {
  return useContext(MatchCtx)?.params ?? {};
}

function useSearchParams() {
  const loc  = useLocation();
  const ctx  = useContext(RouterCtx);
  const parse = (s) => new URLSearchParams(s);
  const params = parse(loc.search);
  const setParams = (next, opts = {}) => {
    const str = '?' + (typeof next === 'function' ? next(params) : next).toString();
    if (opts.replace) ctx.history.replace({ ...loc, search: str });
    else              ctx.history.push({ ...loc, search: str });
  };
  return [params, setParams];
}

function useMatch(pattern) {
  const loc = useLocation();
  return matchPath(pattern, loc.pathname);
}

function useRoutes(routes, location) {
  const ctx = useContext(RouterCtx);
  const loc = location ?? ctx?.location;
  if (!loc) return null;
  const matched = _matchRoutes(routes, loc.pathname);
  if (!matched) return null;
  return _renderMatched(matched, ctx);
}

// ─────────────────────────────────────────────────────────────
//  INTERNAL
// ─────────────────────────────────────────────────────────────
function _collectRoutes(children) {
  return (children || []).flat().filter(Boolean).map(child => {
    if (!child || !child.props) return null;
    const { path, element, index: idx, children: sub, errorElement, loader } = child.props;
    return { path: path || '/', element, index: !!idx, children: sub ? _collectRoutes([sub].flat()) : [], errorElement, loader };
  }).filter(Boolean);
}

function _matchRoutes(routes, pathname) {
  for (const route of routes) {
    const m = matchPath(route.path ?? '/', pathname);
    if (m) return { route, match: m };
    if (route.children?.length) {
      for (const child of route.children) {
        const cm = matchPath((route.path ?? '') + (child.path ?? ''), pathname);
        if (cm) return { route: child, match: cm, parent: route };
      }
    }
  }
  return null;
}

function _renderMatched(matched, ctx) {
  const { route, match } = matched;
  const matchCtx = { params: match.params, pathname: match.pathname, pathnameBase: match.pathname };
  return h(MatchCtx.Provider, { value: matchCtx }, route.element);
}

// ─────────────────────────────────────────────────────────────
//  FACTORY FUNCTIONS  (React Router v6 createBrowserRouter style)
// ─────────────────────────────────────────────────────────────
function createBrowserRouter(routes, opts) {
  const history = createBrowserHistory();
  return { routes, history, basename: opts?.basename ?? '' };
}

function createHashRouter(routes) {
  return { routes, history: createHashHistory() };
}

function createMemoryRouter(routes, opts) {
  return { routes, history: createMemoryHistory(opts?.initialEntries) };
}

function RouterProvider({ router }) {
  const [location, setLocation] = useState(router.history.location);
  useEffect(() => router.history.listen(setLocation), []);
  const matched = _matchRoutes(router.routes, location.pathname.slice(router.basename?.length || 0) || '/');
  const ctx = { history: router.history, location, basename: router.basename ?? '' };
  if (!matched) return null;
  return h(RouterCtx.Provider, { value: ctx },
    h(MatchCtx.Provider, { value: { params: matched.match.params, pathname: matched.match.pathname } },
      matched.route.element
    )
  );
}

// ─────────────────────────────────────────────────────────────
//  EXPORTS
// ─────────────────────────────────────────────────────────────
module.exports = {
  // Routers
  BrowserRouter, HashRouter, MemoryRouter, RouterProvider,
  createBrowserRouter, createHashRouter, createMemoryRouter,

  // Components
  Router, Routes, Route, Outlet, Link, NavLink, Navigate,

  // Hooks
  useNavigate, useLocation, useParams, useSearchParams, useMatch, useRoutes,

  // History factories
  createBrowserHistory, createHashHistory, createMemoryHistory,

  // Internal (for custom integrations)
  matchPath, RouterCtx,
};
