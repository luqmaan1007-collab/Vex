/**
 * Vex Framework — Complete TypeScript Definitions
 * ══════════════════════════════════════════════════════════════
 *  Covers: vex-core, vex-store, vex-router
 *  Mirrors React 18 + Redux Toolkit + React Router v6 APIs
 * ══════════════════════════════════════════════════════════════
 */

// ─────────────────────────────────────────────────────────────
//  CORE TYPES
// ─────────────────────────────────────────────────────────────
export type Key = string | number | null;

export interface Ref<T> {
  current: T | null;
}

export type RefCallback<T> = (instance: T | null) => void;
export type RefObject<T>   = { current: T | null };
export type ForwardedRef<T> = RefCallback<T> | RefObject<T> | null;

export type VexNode =
  | VexElement
  | string
  | number
  | boolean
  | null
  | undefined
  | VexNode[];

export interface VexElement<P = any> {
  $$typeof: symbol;
  type:     ElementType<P>;
  key:      Key;
  ref:      Ref<any> | RefCallback<any> | null;
  props:    P;
}

export type ElementType<P = any> =
  | string
  | FC<P>
  | ComponentClass<P>
  | ExoticComponent<P>;

// ─────────────────────────────────────────────────────────────
//  COMPONENT TYPES
// ─────────────────────────────────────────────────────────────
export interface FC<P = {}> {
  (props: P & { children?: VexNode; key?: Key }): VexElement | null;
  displayName?: string;
  defaultProps?: Partial<P>;
}

export type FunctionComponent<P = {}> = FC<P>;

export interface ComponentClass<P = {}, S = ComponentState> {
  new(props: P): Component<P, S>;
  defaultProps?:           Partial<P>;
  displayName?:            string;
  getDerivedStateFromProps?(props: Readonly<P>, state: Readonly<S>): Partial<S> | null;
  getDerivedStateFromError?(error: any): Partial<S>;
}

export type ComponentState = Record<string, any>;

export abstract class Component<P = {}, S = ComponentState> {
  props:    Readonly<P> & { children?: VexNode };
  state:    Readonly<S>;
  context:  any;
  refs:     Record<string, any>;

  constructor(props: Readonly<P>);

  abstract render(): VexElement | null;

  setState<K extends keyof S>(
    stateOrUpdater: ((prev: Readonly<S>, props: Readonly<P>) => Pick<S, K> | S | null) | (Pick<S, K> | S | null),
    callback?: () => void
  ): void;

  forceUpdate(callback?: () => void): void;

  componentDidMount?():                                                void;
  componentDidUpdate?(prevProps: Readonly<P>, prevState: Readonly<S>, snapshot?: any): void;
  componentWillUnmount?():                                             void;
  shouldComponentUpdate?(nextProps: Readonly<P>, nextState: Readonly<S>): boolean;
  getSnapshotBeforeUpdate?(prevProps: Readonly<P>, prevState: Readonly<S>): any;
  componentDidCatch?(error: Error, info: ErrorInfo):                   void;
}

export interface ErrorInfo {
  componentStack: string;
}

export type PureComponent<P = {}, S = ComponentState> = Component<P, S>;

// ─────────────────────────────────────────────────────────────
//  EXOTIC COMPONENTS
// ─────────────────────────────────────────────────────────────
export interface ExoticComponent<P = {}> {
  (props: P): VexElement | null;
  readonly $$typeof: symbol;
  displayName?: string;
}

export interface MemoExoticComponent<T extends ComponentType<any>>
  extends ExoticComponent<ComponentPropsWithRef<T>> {
  readonly type: T;
  compare?: ((prev: ComponentPropsWithoutRef<T>, next: ComponentPropsWithoutRef<T>) => boolean) | null;
}

export interface ForwardRefExoticComponent<P>
  extends ExoticComponent<P & { ref?: any }> {
  defaultProps?: Partial<P>;
}

export interface ProviderExoticComponent<P> extends ExoticComponent<P> {}

export interface ConsumerProps<T> {
  children: (value: T) => VexNode;
}

// ─────────────────────────────────────────────────────────────
//  CONTEXT
// ─────────────────────────────────────────────────────────────
export interface Context<T> {
  Provider:      ProviderExoticComponent<ProviderProps<T>>;
  Consumer:      ExoticComponent<ConsumerProps<T>>;
  displayName?:  string;
  _currentValue: T;
}

export interface ProviderProps<T> {
  value:     T;
  children?: VexNode;
}

// ─────────────────────────────────────────────────────────────
//  PROPS HELPERS
// ─────────────────────────────────────────────────────────────
export type PropsWithChildren<P = unknown> = P & { children?: VexNode };
export type PropsWithoutRef<P>  = Omit<P, 'ref'>;
export type PropsWithRef<P>     = P & { ref?: Ref<any> | null };
export type ComponentProps<T extends ElementType>     = T extends string ? HTMLAttributes<Element> : T extends FC<infer P> | ComponentClass<infer P> ? P : never;
export type ComponentPropsWithRef<T extends ElementType>    = ComponentProps<T> & { ref?: Ref<any> };
export type ComponentPropsWithoutRef<T extends ElementType> = PropsWithoutRef<ComponentProps<T>>;
export type ComponentType<P = {}> = FC<P> | ComponentClass<P>;

// ─────────────────────────────────────────────────────────────
//  HOOKS
// ─────────────────────────────────────────────────────────────

// useState
export function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];

// useReducer
export function useReducer<R extends Reducer<any, any>>(
  reducer: R, initialState: ReducerState<R>
): [ReducerState<R>, Dispatch<ReducerAction<R>>];
export function useReducer<R extends Reducer<any, any>, I>(
  reducer: R, initialArg: I, init: (arg: I) => ReducerState<R>
): [ReducerState<R>, Dispatch<ReducerAction<R>>];

// useEffect / useLayoutEffect / useInsertionEffect
export function useEffect(effect: EffectCallback, deps?: DependencyList): void;
export function useLayoutEffect(effect: EffectCallback, deps?: DependencyList): void;
export function useInsertionEffect(effect: EffectCallback, deps?: DependencyList): void;

// useMemo / useCallback
export function useMemo<T>(factory: () => T, deps: DependencyList): T;
export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: DependencyList): T;

// useRef
export function useRef<T>(initialValue: T): MutableRefObject<T>;
export function useRef<T>(initialValue: T | null): RefObject<T>;
export function useRef<T = undefined>(): MutableRefObject<T | undefined>;

// useContext
export function useContext<T>(ctx: Context<T>): T;

// useId / useDebugValue
export function useId(): string;
export function useDebugValue<T>(value: T, format?: (value: T) => any): void;

// useTransition / useDeferredValue
export function useTransition(): [boolean, TransitionStartFunction];
export function useDeferredValue<T>(value: T): T;

// useImperativeHandle
export function useImperativeHandle<T, R extends T>(
  ref: Ref<T> | undefined, init: () => R, deps?: DependencyList
): void;

// useSyncExternalStore
export function useSyncExternalStore<T>(
  subscribe:          (onStoreChange: () => void) => () => void,
  getSnapshot:        () => T,
  getServerSnapshot?: () => T
): T;

// ─────────────────────────────────────────────────────────────
//  HOOK UTILITY TYPES
// ─────────────────────────────────────────────────────────────
export type Dispatch<A>               = (action: A) => void;
export type SetStateAction<S>         = S | ((prev: S) => S);
export type Reducer<S, A>             = (state: S, action: A) => S;
export type ReducerState<R>           = R extends Reducer<infer S, any> ? S : never;
export type ReducerAction<R>          = R extends Reducer<any, infer A> ? A : never;
export type EffectCallback            = () => (void | (() => void | undefined));
export type DependencyList            = ReadonlyArray<unknown>;
export type MutableRefObject<T>       = { current: T };
export type TransitionStartFunction   = (scope: () => void) => void;

// ─────────────────────────────────────────────────────────────
//  createElement / JSX
// ─────────────────────────────────────────────────────────────
export function createElement<P>(
  type:    ElementType<P>,
  props?:  (P & { key?: Key; ref?: Ref<any> | null }) | null,
  ...children: VexNode[]
): VexElement<P>;

export function jsx<P>(type: ElementType<P>, props: P, key?: Key): VexElement<P>;
export function jsxs<P>(type: ElementType<P>, props: P, key?: Key): VexElement<P>;

export declare const Fragment:  unique symbol;
export declare const Suspense:  ExoticComponent<SuspenseProps>;
export declare const StrictMode: ExoticComponent<{ children?: VexNode }>;

export interface SuspenseProps {
  children?:  VexNode;
  fallback?:  VexNode;
}

// ─────────────────────────────────────────────────────────────
//  ROOT  (like ReactDOM.createRoot)
// ─────────────────────────────────────────────────────────────
export interface Root {
  render(element: VexNode): void;
  unmount(): void;
}
export function createRoot(container: Element | DocumentFragment): Root;

// ─────────────────────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────────────────────
export function isValidElement(obj: any): obj is VexElement;
export function cloneElement<P>(element: VexElement<P>, props?: Partial<P>, ...children: VexNode[]): VexElement<P>;
export function createRef<T>(): RefObject<T>;
export function createContext<T>(defaultValue: T): Context<T>;
export function memo<P>(Component: FC<P>, compare?: (prev: P, next: P) => boolean): MemoExoticComponent<FC<P>>;
export function forwardRef<T, P = {}>(render: (props: P, ref: ForwardedRef<T>) => VexElement | null): ForwardRefExoticComponent<PropsWithoutRef<P> & { ref?: Ref<T> }>;
export function lazy<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>): T;
export function startTransition(scope: () => void): void;
export function renderToString(element: VexNode): string;

export declare const Children: {
  map<T>(children: VexNode, fn: (child: VexNode, idx: number) => T): T[];
  forEach(children: VexNode, fn: (child: VexNode, idx: number) => void): void;
  count(children: VexNode): number;
  toArray(children: VexNode): VexNode[];
  only(children: VexNode): VexElement;
};

// ─────────────────────────────────────────────────────────────
//  HTML ELEMENT ATTRIBUTES  (for JSX)
// ─────────────────────────────────────────────────────────────
export interface HTMLAttributes<T = Element> extends AriaAttributes {
  children?:   VexNode;
  className?:  string;
  style?:      CSSProperties;
  id?:         string;
  key?:        Key;
  ref?:        Ref<T> | RefCallback<T>;
  hidden?:     boolean;
  tabIndex?:   number;
  title?:      string;
  role?:       AriaRole;
  dir?:        'ltr' | 'rtl' | 'auto';
  lang?:       string;
  draggable?:  boolean | 'true' | 'false';
  spellCheck?: boolean | 'true' | 'false';
  // Events
  onClick?:         EventHandler<MouseEvent, T>;
  onDoubleClick?:   EventHandler<MouseEvent, T>;
  onMouseDown?:     EventHandler<MouseEvent, T>;
  onMouseUp?:       EventHandler<MouseEvent, T>;
  onMouseEnter?:    EventHandler<MouseEvent, T>;
  onMouseLeave?:    EventHandler<MouseEvent, T>;
  onMouseMove?:     EventHandler<MouseEvent, T>;
  onContextMenu?:   EventHandler<MouseEvent, T>;
  onKeyDown?:       EventHandler<KeyboardEvent, T>;
  onKeyUp?:         EventHandler<KeyboardEvent, T>;
  onKeyPress?:      EventHandler<KeyboardEvent, T>;
  onFocus?:         EventHandler<FocusEvent, T>;
  onBlur?:          EventHandler<FocusEvent, T>;
  onChange?:        EventHandler<Event, T>;
  onInput?:         EventHandler<Event, T>;
  onSubmit?:        EventHandler<SubmitEvent, T>;
  onReset?:         EventHandler<Event, T>;
  onScroll?:        EventHandler<Event, T>;
  onWheel?:         EventHandler<WheelEvent, T>;
  onDragStart?:     EventHandler<DragEvent, T>;
  onDrag?:          EventHandler<DragEvent, T>;
  onDragEnd?:       EventHandler<DragEvent, T>;
  onDrop?:          EventHandler<DragEvent, T>;
  onDragOver?:      EventHandler<DragEvent, T>;
  onDragEnter?:     EventHandler<DragEvent, T>;
  onDragLeave?:     EventHandler<DragEvent, T>;
  onPointerDown?:   EventHandler<PointerEvent, T>;
  onPointerUp?:     EventHandler<PointerEvent, T>;
  onPointerMove?:   EventHandler<PointerEvent, T>;
  onPointerEnter?:  EventHandler<PointerEvent, T>;
  onPointerLeave?:  EventHandler<PointerEvent, T>;
  onTouchStart?:    EventHandler<TouchEvent, T>;
  onTouchEnd?:      EventHandler<TouchEvent, T>;
  onTouchMove?:     EventHandler<TouchEvent, T>;
  onLoad?:          EventHandler<Event, T>;
  onError?:         EventHandler<Event, T>;
  onAnimationStart?:    EventHandler<AnimationEvent, T>;
  onAnimationEnd?:      EventHandler<AnimationEvent, T>;
  onTransitionEnd?:     EventHandler<TransitionEvent, T>;
  [key: string]: any;
}

export type EventHandler<E, T = Element> = (event: E & { currentTarget: T }) => void;

export interface InputHTMLAttributes<T = HTMLInputElement> extends HTMLAttributes<T> {
  type?:        string;
  value?:       string | number | readonly string[];
  defaultValue?: string | number | readonly string[];
  checked?:     boolean;
  defaultChecked?: boolean;
  placeholder?: string;
  disabled?:    boolean;
  readOnly?:    boolean;
  required?:    boolean;
  autoFocus?:   boolean;
  autoComplete?: string;
  name?:        string;
  min?:         string | number;
  max?:         string | number;
  step?:        string | number;
  multiple?:    boolean;
  accept?:      string;
  capture?:     boolean | 'user' | 'environment';
  pattern?:     string;
  size?:        number;
  maxLength?:   number;
  minLength?:   number;
}

export interface TextareaHTMLAttributes<T = HTMLTextAreaElement> extends HTMLAttributes<T> {
  value?:       string;
  defaultValue?: string;
  placeholder?: string;
  disabled?:    boolean;
  readOnly?:    boolean;
  required?:    boolean;
  rows?:        number;
  cols?:        number;
  maxLength?:   number;
  minLength?:   number;
  autoFocus?:   boolean;
  name?:        string;
  wrap?:        string;
}

export interface SelectHTMLAttributes<T = HTMLSelectElement> extends HTMLAttributes<T> {
  value?:         string | number | readonly string[];
  defaultValue?:  string | number | readonly string[];
  disabled?:      boolean;
  multiple?:      boolean;
  name?:          string;
  required?:      boolean;
  size?:          number;
  autoFocus?:     boolean;
}

export interface FormHTMLAttributes<T = HTMLFormElement> extends HTMLAttributes<T> {
  action?:       string;
  method?:       string;
  encType?:      string;
  noValidate?:   boolean;
  autoComplete?: string;
  target?:       string;
}

export interface AnchorHTMLAttributes<T = HTMLAnchorElement> extends HTMLAttributes<T> {
  href?:     string;
  target?:   string;
  rel?:      string;
  download?:  any;
  hrefLang?: string;
  type?:     string;
}

export interface ButtonHTMLAttributes<T = HTMLButtonElement> extends HTMLAttributes<T> {
  type?:       'submit' | 'reset' | 'button';
  disabled?:   boolean;
  autoFocus?:  boolean;
  name?:       string;
  value?:      string | number;
  form?:       string;
}

export interface ImgHTMLAttributes<T = HTMLImageElement> extends HTMLAttributes<T> {
  src?:       string;
  alt?:       string;
  width?:     number | string;
  height?:    number | string;
  loading?:   'eager' | 'lazy';
  decoding?:  'sync' | 'async' | 'auto';
  srcSet?:    string;
  sizes?:     string;
  crossOrigin?: 'anonymous' | 'use-credentials';
}

export interface VideoHTMLAttributes<T = HTMLVideoElement> extends HTMLAttributes<T> {
  src?:       string;
  controls?:  boolean;
  autoPlay?:  boolean;
  loop?:      boolean;
  muted?:     boolean;
  poster?:    string;
  preload?:   'none' | 'metadata' | 'auto';
  width?:     number | string;
  height?:    number | string;
  playsInline?: boolean;
}

export interface LabelHTMLAttributes<T = HTMLLabelElement> extends HTMLAttributes<T> {
  htmlFor?: string;
  form?:    string;
}

export interface SVGAttributes<T = SVGElement> extends AriaAttributes {
  children?:  VexNode;
  className?: string;
  style?:     CSSProperties;
  id?:        string;
  key?:       Key;
  ref?:       Ref<T>;
  viewBox?:   string;
  xmlns?:     string;
  fill?:      string;
  stroke?:    string;
  strokeWidth?: string | number;
  d?:         string;
  cx?:        string | number;
  cy?:        string | number;
  r?:         string | number;
  x?:         string | number;
  y?:         string | number;
  width?:     string | number;
  height?:    string | number;
  transform?: string;
  opacity?:   string | number;
  onClick?:   EventHandler<MouseEvent, T>;
  [key: string]: any;
}

// ─────────────────────────────────────────────────────────────
//  CSS PROPERTIES
// ─────────────────────────────────────────────────────────────
export interface CSSProperties {
  [key: string]: string | number | undefined;
  display?:         string;
  position?:        'static' | 'relative' | 'absolute' | 'fixed' | 'sticky';
  top?:             string | number;
  right?:           string | number;
  bottom?:          string | number;
  left?:            string | number;
  width?:           string | number;
  height?:          string | number;
  minWidth?:        string | number;
  maxWidth?:        string | number;
  minHeight?:       string | number;
  maxHeight?:       string | number;
  margin?:          string | number;
  marginTop?:       string | number;
  marginRight?:     string | number;
  marginBottom?:    string | number;
  marginLeft?:      string | number;
  padding?:         string | number;
  paddingTop?:      string | number;
  paddingRight?:    string | number;
  paddingBottom?:   string | number;
  paddingLeft?:     string | number;
  color?:           string;
  backgroundColor?: string;
  background?:      string;
  border?:          string;
  borderRadius?:    string | number;
  fontSize?:        string | number;
  fontWeight?:      string | number;
  fontFamily?:      string;
  lineHeight?:      string | number;
  textAlign?:       'left' | 'right' | 'center' | 'justify';
  flexDirection?:   'row' | 'column' | 'row-reverse' | 'column-reverse';
  alignItems?:      string;
  justifyContent?:  string;
  flexWrap?:        'nowrap' | 'wrap' | 'wrap-reverse';
  flex?:            string | number;
  gap?:             string | number;
  gridTemplateColumns?: string;
  gridTemplateRows?:    string;
  overflow?:        string;
  cursor?:          string;
  opacity?:         number;
  transform?:       string;
  transition?:      string;
  animation?:       string;
  boxShadow?:       string;
  zIndex?:          number;
  pointerEvents?:   'none' | 'auto' | 'all';
  userSelect?:      'none' | 'auto' | 'text' | 'all';
  outline?:         string;
  visibility?:      'visible' | 'hidden' | 'collapse';
  whiteSpace?:      string;
  wordBreak?:       string;
  textDecoration?:  string;
  textTransform?:   string;
  objectFit?:       'fill' | 'contain' | 'cover' | 'none' | 'scale-down';
  listStyle?:       string;
  verticalAlign?:   string;
}

// ─────────────────────────────────────────────────────────────
//  ARIA
// ─────────────────────────────────────────────────────────────
type AriaRole = 'alert' | 'alertdialog' | 'application' | 'article' | 'banner' | 'button' | 'cell' | 'checkbox' | 'columnheader' | 'combobox' | 'complementary' | 'contentinfo' | 'definition' | 'dialog' | 'directory' | 'document' | 'feed' | 'figure' | 'form' | 'grid' | 'gridcell' | 'group' | 'heading' | 'img' | 'link' | 'list' | 'listbox' | 'listitem' | 'log' | 'main' | 'marquee' | 'math' | 'menu' | 'menubar' | 'menuitem' | 'menuitemcheckbox' | 'menuitemradio' | 'navigation' | 'none' | 'note' | 'option' | 'presentation' | 'progressbar' | 'radio' | 'radiogroup' | 'region' | 'row' | 'rowgroup' | 'rowheader' | 'scrollbar' | 'search' | 'searchbox' | 'separator' | 'slider' | 'spinbutton' | 'status' | 'switch' | 'tab' | 'table' | 'tablist' | 'tabpanel' | 'term' | 'textbox' | 'timer' | 'toolbar' | 'tooltip' | 'tree' | 'treegrid' | 'treeitem' | string;

export interface AriaAttributes {
  'aria-label'?:       string;
  'aria-labelledby'?:  string;
  'aria-describedby'?: string;
  'aria-hidden'?:      boolean | 'true' | 'false';
  'aria-live'?:        'assertive' | 'off' | 'polite';
  'aria-required'?:    boolean | 'true' | 'false';
  'aria-disabled'?:    boolean | 'true' | 'false';
  'aria-expanded'?:    boolean | 'true' | 'false';
  'aria-selected'?:    boolean | 'true' | 'false';
  'aria-checked'?:     boolean | 'true' | 'false' | 'mixed';
  'aria-pressed'?:     boolean | 'true' | 'false' | 'mixed';
  'aria-readonly'?:    boolean | 'true' | 'false';
  'aria-controls'?:    string;
  'aria-owns'?:        string;
  'aria-atomic'?:      boolean | 'true' | 'false';
  'aria-busy'?:        boolean | 'true' | 'false';
  'aria-current'?:     boolean | 'page' | 'step' | 'location' | 'date' | 'time' | 'true' | 'false';
  'aria-haspopup'?:    boolean | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog' | 'true' | 'false';
  'aria-invalid'?:     boolean | 'grammar' | 'spelling' | 'true' | 'false';
  'aria-orientation'?: 'horizontal' | 'vertical';
  'aria-placeholder'?: string;
  'aria-sort'?:        'ascending' | 'descending' | 'none' | 'other';
  'aria-valuemin'?:    number;
  'aria-valuemax'?:    number;
  'aria-valuenow'?:    number;
  'aria-valuetext'?:   string;
  'aria-level'?:       number;
  'aria-setsize'?:     number;
  'aria-posinset'?:    number;
  'aria-colcount'?:    number;
  'aria-rowcount'?:    number;
  'aria-colspan'?:     number;
  'aria-rowspan'?:     number;
  'aria-colindex'?:    number;
  'aria-rowindex'?:    number;
  'aria-multiline'?:   boolean | 'true' | 'false';
  'aria-multiselectable'?: boolean | 'true' | 'false';
  'aria-modal'?:       boolean | 'true' | 'false';
  'aria-errormessage'?: string;
  'aria-flowto'?:      string;
  'aria-details'?:     string;
  'aria-activedescendant'?: string;
  'aria-autocomplete'?: 'none' | 'inline' | 'list' | 'both';
  'aria-keyshortcuts'?: string;
  'aria-roledescription'?: string;
}

// ─────────────────────────────────────────────────────────────
//  JSX NAMESPACE
// ─────────────────────────────────────────────────────────────
export namespace JSX {
  type Element             = VexElement;
  type ElementClass        = Component<any, any>;
  type ElementType         = string | ComponentType<any>;
  type LibraryManagedAttributes<C, P> = C extends { defaultProps: infer D } ? Omit<P, keyof D> & Partial<Pick<P, keyof D & keyof P>> : P;

  interface ElementAttributesProperty { props: {}; }
  interface ElementChildrenAttribute  { children: {}; }
  interface IntrinsicAttributes       { key?: Key; }
  interface IntrinsicClassAttributes<T> { ref?: Ref<T>; }

  interface IntrinsicElements {
    // HTML
    a:          AnchorHTMLAttributes<HTMLAnchorElement>;
    abbr:       HTMLAttributes<HTMLElement>;
    address:    HTMLAttributes<HTMLElement>;
    area:       HTMLAttributes<HTMLAreaElement>;
    article:    HTMLAttributes<HTMLElement>;
    aside:      HTMLAttributes<HTMLElement>;
    audio:      HTMLAttributes<HTMLAudioElement>;
    b:          HTMLAttributes<HTMLElement>;
    base:       HTMLAttributes<HTMLBaseElement>;
    bdi:        HTMLAttributes<HTMLElement>;
    bdo:        HTMLAttributes<HTMLElement>;
    big:        HTMLAttributes<HTMLElement>;
    blockquote: HTMLAttributes<HTMLQuoteElement>;
    body:       HTMLAttributes<HTMLBodyElement>;
    br:         HTMLAttributes<HTMLBRElement>;
    button:     ButtonHTMLAttributes<HTMLButtonElement>;
    canvas:     HTMLAttributes<HTMLCanvasElement>;
    caption:    HTMLAttributes<HTMLTableCaptionElement>;
    cite:       HTMLAttributes<HTMLElement>;
    code:       HTMLAttributes<HTMLElement>;
    col:        HTMLAttributes<HTMLTableColElement>;
    colgroup:   HTMLAttributes<HTMLTableColElement>;
    data:       HTMLAttributes<HTMLDataElement>;
    datalist:   HTMLAttributes<HTMLDataListElement>;
    dd:         HTMLAttributes<HTMLElement>;
    del:        HTMLAttributes<HTMLModElement>;
    details:    HTMLAttributes<HTMLDetailsElement>;
    dfn:        HTMLAttributes<HTMLElement>;
    dialog:     HTMLAttributes<HTMLDialogElement>;
    div:        HTMLAttributes<HTMLDivElement>;
    dl:         HTMLAttributes<HTMLDListElement>;
    dt:         HTMLAttributes<HTMLElement>;
    em:         HTMLAttributes<HTMLElement>;
    embed:      HTMLAttributes<HTMLEmbedElement>;
    fieldset:   HTMLAttributes<HTMLFieldSetElement>;
    figcaption: HTMLAttributes<HTMLElement>;
    figure:     HTMLAttributes<HTMLElement>;
    footer:     HTMLAttributes<HTMLElement>;
    form:       FormHTMLAttributes<HTMLFormElement>;
    h1:         HTMLAttributes<HTMLHeadingElement>;
    h2:         HTMLAttributes<HTMLHeadingElement>;
    h3:         HTMLAttributes<HTMLHeadingElement>;
    h4:         HTMLAttributes<HTMLHeadingElement>;
    h5:         HTMLAttributes<HTMLHeadingElement>;
    h6:         HTMLAttributes<HTMLHeadingElement>;
    head:       HTMLAttributes<HTMLHeadElement>;
    header:     HTMLAttributes<HTMLElement>;
    hgroup:     HTMLAttributes<HTMLElement>;
    hr:         HTMLAttributes<HTMLHRElement>;
    html:       HTMLAttributes<HTMLHtmlElement>;
    i:          HTMLAttributes<HTMLElement>;
    iframe:     HTMLAttributes<HTMLIFrameElement>;
    img:        ImgHTMLAttributes<HTMLImageElement>;
    input:      InputHTMLAttributes<HTMLInputElement>;
    ins:        HTMLAttributes<HTMLModElement>;
    kbd:        HTMLAttributes<HTMLElement>;
    label:      LabelHTMLAttributes<HTMLLabelElement>;
    legend:     HTMLAttributes<HTMLLegendElement>;
    li:         HTMLAttributes<HTMLLIElement>;
    link:       HTMLAttributes<HTMLLinkElement>;
    main:       HTMLAttributes<HTMLElement>;
    map:        HTMLAttributes<HTMLMapElement>;
    mark:       HTMLAttributes<HTMLElement>;
    menu:       HTMLAttributes<HTMLMenuElement>;
    meta:       HTMLAttributes<HTMLMetaElement>;
    meter:      HTMLAttributes<HTMLMeterElement>;
    nav:        HTMLAttributes<HTMLElement>;
    noscript:   HTMLAttributes<HTMLElement>;
    object:     HTMLAttributes<HTMLObjectElement>;
    ol:         HTMLAttributes<HTMLOListElement>;
    optgroup:   HTMLAttributes<HTMLOptGroupElement>;
    option:     HTMLAttributes<HTMLOptionElement>;
    output:     HTMLAttributes<HTMLOutputElement>;
    p:          HTMLAttributes<HTMLParagraphElement>;
    picture:    HTMLAttributes<HTMLElement>;
    pre:        HTMLAttributes<HTMLPreElement>;
    progress:   HTMLAttributes<HTMLProgressElement>;
    q:          HTMLAttributes<HTMLQuoteElement>;
    rp:         HTMLAttributes<HTMLElement>;
    rt:         HTMLAttributes<HTMLElement>;
    ruby:       HTMLAttributes<HTMLElement>;
    s:          HTMLAttributes<HTMLElement>;
    samp:       HTMLAttributes<HTMLElement>;
    script:     HTMLAttributes<HTMLScriptElement>;
    section:    HTMLAttributes<HTMLElement>;
    select:     SelectHTMLAttributes<HTMLSelectElement>;
    slot:       HTMLAttributes<HTMLSlotElement>;
    small:      HTMLAttributes<HTMLElement>;
    source:     HTMLAttributes<HTMLSourceElement>;
    span:       HTMLAttributes<HTMLSpanElement>;
    strong:     HTMLAttributes<HTMLElement>;
    style:      HTMLAttributes<HTMLStyleElement>;
    sub:        HTMLAttributes<HTMLElement>;
    summary:    HTMLAttributes<HTMLElement>;
    sup:        HTMLAttributes<HTMLElement>;
    table:      HTMLAttributes<HTMLTableElement>;
    tbody:      HTMLAttributes<HTMLTableSectionElement>;
    td:         HTMLAttributes<HTMLTableDataCellElement>;
    template:   HTMLAttributes<HTMLTemplateElement>;
    textarea:   TextareaHTMLAttributes<HTMLTextAreaElement>;
    tfoot:      HTMLAttributes<HTMLTableSectionElement>;
    th:         HTMLAttributes<HTMLTableHeaderCellElement>;
    thead:      HTMLAttributes<HTMLTableSectionElement>;
    time:       HTMLAttributes<HTMLTimeElement>;
    title:      HTMLAttributes<HTMLTitleElement>;
    tr:         HTMLAttributes<HTMLTableRowElement>;
    track:      HTMLAttributes<HTMLTrackElement>;
    u:          HTMLAttributes<HTMLElement>;
    ul:         HTMLAttributes<HTMLUListElement>;
    var:        HTMLAttributes<HTMLElement>;
    video:      VideoHTMLAttributes<HTMLVideoElement>;
    wbr:        HTMLAttributes<HTMLElement>;
    // SVG
    svg:        SVGAttributes<SVGSVGElement>;
    circle:     SVGAttributes<SVGCircleElement>;
    ellipse:    SVGAttributes<SVGEllipseElement>;
    line:       SVGAttributes<SVGLineElement>;
    path:       SVGAttributes<SVGPathElement>;
    polygon:    SVGAttributes<SVGPolygonElement>;
    polyline:   SVGAttributes<SVGPolylineElement>;
    rect:       SVGAttributes<SVGRectElement>;
    text:       SVGAttributes<SVGTextElement>;
    tspan:      SVGAttributes<SVGTSpanElement>;
    g:          SVGAttributes<SVGGElement>;
    defs:       SVGAttributes<SVGDefsElement>;
    use:        SVGAttributes<SVGUseElement>;
    symbol:     SVGAttributes<SVGSymbolElement>;
    mask:       SVGAttributes<SVGMaskElement>;
    linearGradient: SVGAttributes<SVGLinearGradientElement>;
    radialGradient: SVGAttributes<SVGRadialGradientElement>;
    stop:       SVGAttributes<SVGStopElement>;
    clipPath:   SVGAttributes<SVGClipPathElement>;
    filter:     SVGAttributes<SVGFilterElement>;
    [elemName: string]: any;
  }
}

// ─────────────────────────────────────────────────────────────
//  @vex/store  TYPES
// ─────────────────────────────────────────────────────────────
export interface Signal<T> {
  value:       T;
  subscribe(fn: (val: T) => void): () => void;
  peek():      T;
  update(fn: (prev: T) => T): void;
}

export function signal<T>(initial: T): Signal<T>;
export function computed<T>(fn: () => T, deps: Signal<any>[]): Pick<Signal<T>, 'value' | 'subscribe' | 'peek'>;
export function atom<T>(initial: T): Signal<T>;

export interface StoreApi<T> {
  getState():    T;
  setState(partial: Partial<T> | ((s: T) => Partial<T>), replace?: boolean): void;
  subscribe(fn: (state: T) => void): () => void;
  destroy():     void;
}

export function create<T>(initializer: (set: StoreApi<T>['setState'], get: StoreApi<T>['getState'], api: StoreApi<T>) => T): ((selector?: (s: T) => any) => any) & StoreApi<T>;

export interface SliceOptions<S, R extends Record<string, (state: S, action: any) => void>> {
  name:         string;
  initialState: S;
  reducers:     R;
  extraReducers?: ((builder: ActionBuilder) => void) | Record<string, (state: S, action: any) => void>;
}
export function createSlice<S, R extends Record<string, (state: S, action: any) => void>>(options: SliceOptions<S, R>): {
  name:    string;
  reducer: (state: S | undefined, action: any) => S;
  actions: { [K in keyof R]: ((payload?: any) => { type: string; payload?: any }) & { type: string } };
};
export function createAsyncThunk<R, A = void>(type: string, payloadCreator: (arg: A, api: { dispatch: any; getState: any }) => Promise<R>): (arg: A) => (dispatch: any, getState: any) => Promise<R>;
export function configureStore(options: { reducer: any; middleware?: any; preloadedState?: any; devTools?: boolean }): any;
export function combineReducers<M extends Record<string, (s: any, a: any) => any>>(reducers: M): (state: any, action: any) => any;
export declare const thunkMiddleware: any;
export declare const loggerMiddleware: any;

// ─────────────────────────────────────────────────────────────
//  @vex/router  TYPES
// ─────────────────────────────────────────────────────────────
export interface Location {
  pathname: string;
  search:   string;
  hash:     string;
  state:    any;
  key:      string;
}

export interface NavigateOptions {
  replace?: boolean;
  state?:   any;
}

export type NavigateFunction = (to: string | number | Partial<Location>, opts?: NavigateOptions) => void;

export interface Params<Key extends string = string> {
  readonly [k in Key]: string | undefined;
}

export interface RouteMatch<Params extends Record<string, string | undefined> = Record<string, string | undefined>> {
  params:       Params;
  pathname:     string;
  pathnameBase: string;
}

export interface RouteObject {
  path?:         string;
  element?:      VexNode;
  index?:        boolean;
  children?:     RouteObject[];
  errorElement?: VexNode;
  loader?:       (args: any) => Promise<any>;
  action?:       (args: any) => Promise<any>;
}

// Router components
export declare function BrowserRouter(props: { children?: VexNode; basename?: string }): VexElement;
export declare function HashRouter(props: { children?: VexNode }): VexElement;
export declare function MemoryRouter(props: { children?: VexNode; initialEntries?: string[]; initialIndex?: number }): VexElement;
export declare function Routes(props: { children?: VexNode }): VexElement | null;
export declare function Route(props: { path?: string; element?: VexNode; index?: boolean; children?: VexNode; errorElement?: VexNode }): null;
export declare function Outlet(props: { context?: any }): VexElement | null;
export declare function Link(props: AnchorHTMLAttributes & { to: string | Partial<Location>; replace?: boolean; state?: any; children?: VexNode }): VexElement;
export declare function NavLink(props: HTMLAttributes & { to: string; end?: boolean; className?: string | ((p: { isActive: boolean }) => string); style?: CSSProperties | ((p: { isActive: boolean }) => CSSProperties); children?: VexNode | ((p: { isActive: boolean }) => VexNode) }): VexElement;
export declare function Navigate(props: { to: string | Partial<Location>; replace?: boolean; state?: any }): null;
export declare function RouterProvider(props: { router: any }): VexElement | null;

// Router hooks
export function useNavigate(): NavigateFunction;
export function useLocation(): Location;
export function useParams<P extends Record<string, string | undefined> = Record<string, string | undefined>>(): P;
export function useSearchParams(): [URLSearchParams, (next: URLSearchParams | ((p: URLSearchParams) => URLSearchParams), opts?: NavigateOptions) => void];
export function useMatch(pattern: string): RouteMatch | null;
export function useRoutes(routes: RouteObject[], location?: Partial<Location>): VexElement | null;

// Router factories
export function createBrowserRouter(routes: RouteObject[], opts?: { basename?: string }): any;
export function createHashRouter(routes: RouteObject[]): any;
export function createMemoryRouter(routes: RouteObject[], opts?: { initialEntries?: string[]; initialIndex?: number }): any;

// ─────────────────────────────────────────────────────────────
//  VEX LANGUAGE TYPES  (for .vx syntax features)
// ─────────────────────────────────────────────────────────────

/** Result type — like Rust's Result<T, E> */
export type Result<T, E = Error> =
  | { ok: true;  value: T; isOk: true;  isErr: false }
  | { ok: false; error: E; isOk: false; isErr: true  };

/** Option type — like Rust's Option<T> */
export type Option<T> = T | null | undefined;

/** Generic range */
export interface Range<T = number> {
  from: T;
  to:   T;
  step?: T;
  inclusive: boolean;
  [Symbol.iterator](): Iterator<T>;
}

/** Vex store definition (from .vx `store` macro) */
export interface VexStore<State, Actions extends Record<string, (...args: any[]) => void> = {}> {
  state:     State;
  subscribe: (fn: (state: State) => void) => () => void;
  dispatch:  (action: keyof Actions, ...args: any[]) => void;
} & Actions;

/** Vex signal (from .vx `signal`/`reactive` macro) */
export type VexSignal<T> = Signal<T>;

// ─────────────────────────────────────────────────────────────
//  MODULE DECLARATIONS
// ─────────────────────────────────────────────────────────────
declare module '@vex/core' {
  export * from './types/vex';
}
declare module '@vex/store' {
  export { signal, computed, atom, create, createSlice, createAsyncThunk, configureStore, combineReducers, thunkMiddleware, loggerMiddleware };
}
declare module '@vex/router' {
  export { BrowserRouter, HashRouter, MemoryRouter, Routes, Route, Outlet, Link, NavLink, Navigate, RouterProvider, useNavigate, useLocation, useParams, useSearchParams, useMatch, useRoutes, createBrowserRouter, createHashRouter, createMemoryRouter };
}
