# Vex Framework

> React-level UI framework with unlimited `.vx` syntax.
> Write components in any keywords you want. Compiles to clean JavaScript.

---

## 📁 Project Structure — WHERE EVERYTHING GOES

```
vex/
├── transpiler/
│   └── vex.js          ← THE COMPILER  (run this on .vx files)
│
├── packages/
│   ├── vex-core/
│   │   └── index.js    ← Runtime: fiber reconciler, all hooks, createRoot
│   ├── vex-store/
│   │   └── index.js    ← State: signal, atom, create(), Redux slices
│   ├── vex-router/
│   │   └── index.js    ← Router: BrowserRouter, Link, useNavigate
│   └── vex-devtools/
│       └── index.js    ← DevTools: inspector, profiler, hot reload
│
├── types/
│   └── vex.d.ts        ← ALL TypeScript types (JSX, hooks, components…)
│
└── examples/
    └── todo-app/       ← Full working example app
        ├── src/App.vx  ← Source in .vx syntax
        └── index.html  ← Open in browser
```

---

## ⚡ Quick Start

### 1. Write a component in `.vx`

```vx
// src/Counter.vx
import { useState, useEffect } from "@vex/core"

component Counter({ start = 0 }) {
  const [count, setCount] = useState(start)

  useEffect(() => {
    document.title = `Count: ${count}`
  }, [count])   // ← auto re-renders when count changes

  render =>
    <div>
      <h1>{count}</h1>
      <button onClick={() => setCount(c => c + 1)}>+</button>
      <button onClick={() => setCount(c => c - 1)}>−</button>
    </div>
}

export default Counter
```

### 2. Transpile it

```bash
node transpiler/vex.js src/Counter.vx -o dist/Counter.js
```

### 3. Mount to DOM

```html
<div id="root"></div>
<script type="module">
  import Counter from './dist/Counter.js';
  import { createRoot } from './packages/vex-core/index.js';

  createRoot(document.getElementById('root')).render(Counter({ start: 10 }));
</script>
```

That's it. **State changes → DOM updates automatically.** No manual `.render()` calls.

---

## ✅ What's Fixed vs Old Vex

| Feature | Old Vex | New Vex |
|---|---|---|
| Virtual DOM | ✅ | ✅ |
| Reconciliation | ❌ overwrites container | ✅ keyed diffing |
| Hook scheduler | ❌ none | ✅ full hook linked list |
| JSX compilation | ❌ manual `Vex.el()` | ✅ transpiler auto-converts |
| Automatic re-render | ❌ manual `Vex.render()` | ✅ setState → auto re-render |
| TypeScript types | ❌ | ✅ complete `types/vex.d.ts` |
| Separate packages | ❌ everything in one blob | ✅ vex-core, vex-store, vex-router |

---

## 🪝 All Hooks (same as React 18)

```vx
import {
  useState,           // local state
  useReducer,         // complex state with reducer
  useEffect,          // side effects (async, subscriptions)
  useLayoutEffect,    // DOM-sync effects
  useInsertionEffect, // CSS-in-JS insertion
  useMemo,            // memoize expensive values
  useCallback,        // memoize functions
  useRef,             // mutable refs / DOM refs
  useContext,         // read context
  useId,              // stable unique ID
  useTransition,      // mark updates as non-urgent
  useDeferredValue,   // defer a value update
  useImperativeHandle,// expose ref handles
  useDebugValue,      // devtools label
  useSyncExternalStore// external store subscription
} from "@vex/core"
```

---

## 🎨 User-Defined Syntax (Vex unique feature)

```vx
// Define new keywords anywhere in a .vx file:
syntax unless(cond, body)      => `if(!(cond)) body`
syntax forever(body)           => `while(true) body`
syntax times(n, body)          => `for(let __i=0;__i<n;__i++) body`
syntax retry(n, body)          => `for(let __r=0;__r<n;__r++) { try { body; break } catch(e){} }`
syntax guard(cond, otherwise)  => `if(!(cond)) { return otherwise }`

// Now use them like real language keywords:
unless(user.isLoggedIn) {
  return <LoginPage />
}

times(5) {
  console.log("hello")
}

forever {
  await poll()
  await sleep(1000)
}
```

---

## 🗃️ State Management

```vx
import { signal, create, createSlice, configureStore } from "@vex/store"

// 1. Signal (reactive primitive — like MobX / SolidJS)
const count = signal(0)
count.value = 1          // triggers subscribers
count.subscribe(v => console.log("count:", v))

// 2. Zustand-style store
const useStore = create((set) => ({
  user:  null,
  login: (u) => set({ user: u }),
  logout: () => set({ user: null }),
}))

component Header() {
  const user = useStore(s => s.user)
  return <h1>{user?.name ?? "Guest"}</h1>
}

// 3. Redux Toolkit-style slice
const todosSlice = createSlice({
  name: "todos",
  initialState: [],
  reducers: {
    add:    (state, action) => { state.push(action.payload) },
    remove: (state, action) => state.filter(t => t.id !== action.payload),
  }
})

const store = configureStore({ reducer: { todos: todosSlice.reducer } })
```

---

## 🗺️ Router

```vx
import { BrowserRouter, Routes, Route, Link, useNavigate, useParams } from "@vex/router"

component App() {
  render =>
    <BrowserRouter>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/about">About</Link>
      </nav>
      <Routes>
        <Route path="/"          element={<HomePage />} />
        <Route path="/user/:id"  element={<UserPage />} />
        <Route path="/about"     element={<AboutPage />} />
      </Routes>
    </BrowserRouter>
}

component UserPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  return <div>
    <h1>User {id}</h1>
    <button onClick={() => navigate("/")}>Home</button>
  </div>
}
```

---

## 🔷 TypeScript

Add to your `tsconfig.json`:
```json
{
  "compilerOptions": {
    "typeRoots": ["./types"],
    "jsx": "react",
    "jsxFactory": "createElement",
    "jsxFragmentFactory": "Fragment"
  }
}
```

Then import types:
```ts
import type { FC, VexNode, CSSProperties, HTMLAttributes } from './types/vex'

interface ButtonProps {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary'
}

const Button: FC<ButtonProps> = ({ label, onClick, variant = 'primary' }) => {
  return createElement('button', { onClick, className: `btn btn-${variant}` }, label)
}
```

---

## 🔧 Transpiler CLI

```bash
# Transpile one file
node transpiler/vex.js src/App.vx

# Transpile and output to specific file
node transpiler/vex.js src/App.vx -o dist/App.js

# Transpile and immediately run
node transpiler/vex.js src/script.vx --run

# Show AST (debug)
node transpiler/vex.js src/App.vx --ast

# Show tokens (debug)
node transpiler/vex.js src/App.vx --tokens
```

---

## 📦 GitHub Setup

```bash
git init
git add .
git commit -m "feat: Vex framework v0.1.0"
git remote add origin https://github.com/YOUR_USERNAME/vex-lang
git push -u origin main
```

---

## 🗺️ Roadmap

- [ ] Concurrent mode (Suspense boundaries, time-slicing)
- [ ] Server components
- [ ] Native renderer (iOS/Android via JSI)
- [ ] VSCode extension (syntax highlighting, IntelliSense)
- [ ] Browser playground
- [ ] `vex create` CLI scaffolding tool
- [ ] Hot Module Replacement plugin for Vite/webpack

---

## License

MIT © Vex Contributors
