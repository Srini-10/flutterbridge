// The provider container — Riverpod's runtime, as a small library with no React in it.
//
// ## What this is, and what it is measured against
//
// A `ProviderContainer` owns one value per provider (per family argument), builds them lazily, remembers which providers a
// provider watched while it was being built, and rebuilds a dependent when — and only when — something it watched changed.
// Every behaviour below was **recorded from the real `riverpod` 2.6.1** by `fixtures/riverpod_oracle` and is replayed by
// `tests/riverpod_oracle.test.ts`; where this file states a rule, that scenario is its evidence. The ones a reader would not guess:
//
// - `listen` builds the provider eagerly; a `read` builds it on the spot.
// - **A source notifies synchronously.** `StateProvider`/`StateNotifier` call their listeners inside the assignment. A *derived*
//   provider is recomputed later — in a microtask, and only if it has a listener (directly or through a dependent). With nobody
//   listening it is recomputed **on its next read** and not before.
// - A dependent is rebuilt only if a dependency's value *changed*: `b = a % 2` with `a` going 0 → 2 rebuilds `b`, sees `0 → 0`,
//   and leaves `c = b + 1` alone.
// - Equality is not one rule. `StateProvider` and `StateNotifier` notify unless the new value is `identical`; a derived
//   `Provider` unless it is `==`; an `AsyncValue` by its own `==`.
// - `autoDispose` disposes in a microtask *after* the last listener leaves, not inside `close()`. A provider that is only ever
//   `read` is created and then disposed a microtask later.
// - A stale future's result is dropped: `invalidate` while a run is pending makes the earlier result unobservable.
//
// ## Deliberately not here
//
// `ref.keepAlive`, `AsyncNotifier`, code-generated providers, and an override for a family member are refused rather than
// approximated (`docs/m14/riverpod-usage-matrix.md` §4).

import { AsyncValue } from './async_value.js';
import { dartRecordEquals } from '../core/dart_core.js';

// ── equality and family keys ──────────────────────────────────────────────────────────────────────────────────────────────

/** `a == b` the way Dart writes it: identity, then the value's own `$eq`, then structural for a record or a list. */
export function dartEquals(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;
  const eq = (a as { $eq?: (o: unknown) => boolean }).$eq;
  if (typeof eq === 'function') return eq.call(a, b);
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => dartEquals(x, b[i]));
  }
  return isRecord(a) && isRecord(b) ? dartRecordEquals(a, b) : false;
}

/** A record lowers to a plain object; a class instance has another prototype. */
function isRecord(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

const identityIds = new WeakMap<object, number>();
let nextIdentityId = 0;

/** Where a family argument lands in the cache. Equal arguments share a bucket; `dartEquals` then decides within it. */
function bucketOf(arg: unknown): string {
  if (arg === null || arg === undefined) return 'nil';
  switch (typeof arg) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'bigint':
      return `${typeof arg}:${String(arg)}`;
    default:
      break;
  }
  if (Array.isArray(arg)) return `[${arg.map(bucketOf).join(',')}]`;
  const hash = (arg as { hashCode?: unknown }).hashCode;
  if (typeof hash === 'number') return `h:${hash}`;
  if (isRecord(arg)) {
    const record = arg as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((k) => `${k}=${bucketOf(record[k])}`).join(',')}}`;
  }
  let id = identityIds.get(arg as object);
  if (id === undefined) {
    id = nextIdentityId++;
    identityIds.set(arg as object, id);
  }
  return `o:${id}`;
}

let nextDefId = 0;
const defIds = new WeakMap<object, number>();

/** A stable key for the provider a listenable reads: equal for two `provider(arg)` calls with equal arguments. */
export function sourceKeyOf(target: Listenable<unknown>): string {
  const { def, arg, hasArg } = target.source;
  let id = defIds.get(def);
  if (id === undefined) {
    id = nextDefId++;
    defIds.set(def, id);
  }
  return `${id}:${hasArg ? bucketOf(arg) : ''}`;
}

// ── providers ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** What a provider builds. */
export type ProviderKind = 'provider' | 'state' | 'stateNotifier' | 'notifier' | 'future' | 'stream';

/** The part a `StreamProvider`'s `create` returns: anything that can be listened to, or iterated. */
export interface StreamLike<T> {
  listen(onData: (value: T) => void, onError?: (error: unknown) => void, onDone?: () => void): { cancel(): unknown };
}

/** What a provider's `create` and a notifier's owner see. */
export interface Ref {
  /** Reads a provider and **depends on it**: this one is rebuilt when the value read changes. */
  watch<T>(target: Listenable<T>): T;
  /** Reads a provider without depending on it. */
  read<T>(target: Listenable<T>): T;
  /** Runs `callback(previous, next)` when the target changes; closed when this provider is rebuilt or disposed. */
  listen<T>(target: Listenable<T>, callback: (previous: T | null, next: T) => void, options?: ListenOptions): Subscription;
  /** Marks a provider for rebuilding. */
  invalidate(target: Listenable<unknown>): void;
  /** Rebuilds a provider now and returns its new value. */
  refresh<T>(target: Listenable<T>): T;
  /** Runs `callback` when this provider is disposed or rebuilt. */
  onDispose(callback: () => void): void;
}

/** `ref.listen`'s and `container.listen`'s options. */
export interface ListenOptions {
  readonly fireImmediately?: boolean;
}

/** What `listen` returns. */
export interface Subscription {
  close(): void;
  read(): unknown;
}

/** How a provider is declared. */
export interface ProviderOptions {
  readonly autoDispose?: boolean;
  readonly name?: string;
}

/** A provider's declaration — shared by every family member. */
export class ProviderDef {
  constructor(
    readonly kind: ProviderKind,
    readonly create: (ref: Ref, arg?: unknown) => unknown,
    readonly autoDispose: boolean,
    readonly name: string | undefined,
    readonly family: boolean,
  ) {}

  /** The notification rule: a source is `identical`, a derived provider `==`. */
  equals(a: unknown, b: unknown): boolean {
    return this.kind === 'state' || this.kind === 'stateNotifier' || this.kind === 'notifier' ? Object.is(a, b) : dartEquals(a, b);
  }
}

/**
 * Something a container can read or listen to: a provider, `provider.notifier`, `provider.future`, or
 * `provider.select(fn)`.
 */
export abstract class Listenable<T> {
  /** The declaration and argument of the provider this reads. */
  abstract readonly source: ProviderInstance<unknown>;
  /** What a reader sees, given the provider's current element. */
  abstract pick(element: Element): T;
  /** Whether two picks are the same, i.e. whether a listener or a dependent has nothing to react to. */
  abstract same(a: T, b: T): boolean;
}

/** A provider applied to its family argument, or a plain provider. */
export class ProviderInstance<T> extends Listenable<T> {
  constructor(
    readonly def: ProviderDef,
    readonly arg: unknown,
    readonly hasArg: boolean,
  ) {
    super();
  }

  get source(): ProviderInstance<unknown> {
    return this as ProviderInstance<unknown>;
  }

  pick(element: Element): T {
    return element.value as T;
  }

  same(a: T, b: T): boolean {
    return this.def.equals(a, b);
  }

  /** `provider.notifier`. */
  get notifier(): Listenable<unknown> {
    return new NotifierView(this as ProviderInstance<unknown>);
  }

  /** `provider.future`. */
  get future(): Listenable<Promise<unknown>> {
    return new FutureView(this as ProviderInstance<unknown>);
  }

  /** `provider.select(fn)`. */
  select<R>(project: (value: T) => R): Listenable<R> {
    return new SelectView<T, R>(this, project);
  }

  /** `provider.overrideWithValue(value)`. */
  overrideWithValue(value: T): Override {
    return { target: this as ProviderInstance<unknown>, value, hasValue: true };
  }

  /** `provider.overrideWith(create)`. */
  overrideWith(create: (ref: Ref) => unknown): Override {
    return { target: this as ProviderInstance<unknown>, create, hasValue: false };
  }
}

class NotifierView extends Listenable<unknown> {
  constructor(readonly source: ProviderInstance<unknown>) {
    super();
  }
  pick(element: Element): unknown {
    if (element.def.kind === 'state') return element.controller;
    if (element.def.kind === 'stateNotifier' || element.def.kind === 'notifier') return element.notifier;
    throw new Error(`\`${element.def.name ?? element.def.kind}\` has no \`.notifier\``);
  }
  same(a: unknown, b: unknown): boolean {
    return Object.is(a, b);
  }
}

class FutureView extends Listenable<Promise<unknown>> {
  constructor(readonly source: ProviderInstance<unknown>) {
    super();
  }
  pick(element: Element): Promise<unknown> {
    if (element.deferred === undefined) throw new Error(`\`${element.def.name ?? element.def.kind}\` has no \`.future\``);
    return element.deferred.promise;
  }
  same(a: Promise<unknown>, b: Promise<unknown>): boolean {
    return Object.is(a, b);
  }
}

class SelectView<T, R> extends Listenable<R> {
  constructor(
    private readonly instance: ProviderInstance<T>,
    private readonly project: (value: T) => R,
  ) {
    super();
  }
  get source(): ProviderInstance<unknown> {
    return this.instance.source;
  }
  pick(element: Element): R {
    return this.project(element.value as T);
  }
  same(a: R, b: R): boolean {
    return dartEquals(a, b);
  }
}

/** A provider replaced in a container. */
export interface Override {
  readonly target: ProviderInstance<unknown>;
  readonly hasValue: boolean;
  readonly value?: unknown;
  readonly create?: (ref: Ref) => unknown;
}

/** A family: `family(arg)` is the provider for `arg`. */
export type Family<T, A> = ((arg: A) => ProviderInstance<T>) & { readonly def: ProviderDef };

/** Declares a provider of any kind. */
export function defineProvider<T>(kind: ProviderKind, create: (ref: Ref) => unknown, options: ProviderOptions = {}): ProviderInstance<T> {
  return new ProviderInstance<T>(new ProviderDef(kind, create as ProviderDef['create'], options.autoDispose ?? false, options.name, false), undefined, false);
}

/** Declares a family of providers of any kind. */
export function defineFamily<T, A>(kind: ProviderKind, create: (ref: Ref, arg: A) => unknown, options: ProviderOptions = {}): Family<T, A> {
  const def = new ProviderDef(kind, create as ProviderDef['create'], options.autoDispose ?? false, options.name, true);
  return Object.assign((arg: A) => new ProviderInstance<T>(def, arg, true), { def });
}

/**
 * `family(arg)` applied to a family's own declaration (shared by {@link defineStateFamily} and
 * {@link defineStateNotifierFamily}): identical to {@link defineFamily}'s own construction, except each
 * member is `wrap`'s subclass rather than a plain `ProviderInstance` — the one thing those two need beyond
 * what `defineFamily` already gives every other kind, and the reason they exist as their own functions
 * rather than a `defineFamily` call site casting the result.
 */
function familyOf<A, I extends ProviderInstance<unknown>>(
  kind: ProviderKind,
  create: (ref: Ref, arg: A) => unknown,
  options: ProviderOptions,
  wrap: (def: ProviderDef, arg: A) => I,
): ((arg: A) => I) & { readonly def: ProviderDef } {
  const def = new ProviderDef(kind, create as ProviderDef['create'], options.autoDispose ?? false, options.name, true);
  return Object.assign((arg: A) => wrap(def, arg), { def });
}

// ── state holders ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const ATTACH = Symbol('bridge.riverpod.attach');

/** `StateNotifier<S>` — what a class `extends StateNotifier<S>` inherits. */
export class StateNotifier<S> {
  #state: S;
  #mounted = true;
  #onChange: ((previous: S, next: S) => void) | undefined;
  #onDispose: Array<() => void> = [];

  constructor(state: S) {
    this.#state = state;
  }

  get state(): S {
    return this.#state;
  }

  set state(next: S) {
    if (!this.#mounted) throw new Error('Bad state: Tried to use a StateNotifier after `dispose` was called.');
    const previous = this.#state;
    this.#state = next;
    if (this.updateShouldNotify(previous, next)) this.#onChange?.(previous, next);
  }

  get mounted(): boolean {
    return this.#mounted;
  }

  /** `!identical(old, current)`. */
  protected updateShouldNotify(old: S, current: S): boolean {
    return !Object.is(old, current);
  }

  dispose(): void {
    this.#mounted = false;
    for (const callback of this.#onDispose.splice(0)) callback();
  }

  /** The container's hook; not part of the Dart surface. */
  [ATTACH](onChange: (previous: S, next: S) => void): void {
    this.#onChange = onChange;
  }
}

const ATTACH_REF = Symbol('bridge.riverpod.attachRef');

/**
 * `Notifier<S>` — what a class `extends Notifier<S>` inherits (Riverpod 2's own `Notifier` API, the
 * successor `NotifierProvider` uses in place of `StateNotifierProvider`'s create-closure convention).
 *
 * Deliberately its own class here, not built by extending or composing `StateNotifier<S>`
 * (`docs/m14/riverpod-usage-matrix.md` §4e has the full account): `Notifier`'s own construction is a
 * two-step protocol `StateNotifier`'s is not — a zero-argument factory builds the bare instance, the
 * container then *attaches* `ref` to it (`[ATTACH_REF]`, below), and only then calls the project's own
 * overridden `build()` to compute the value `StateNotifier`'s own constructor instead takes directly, as
 * an ordinary argument — so sharing a base would mean changing `StateNotifier`'s own, already
 * oracle-verified constructor signature to fit a protocol it was never measured against. What the two
 * classes *do* share, structurally rather than by inheritance, is the identical notify-on-change contract
 * (`state`, `mounted`, `dispose()`, the `[ATTACH]` hook) `ProviderContainer`'s own `run()` already drives
 * either one through — the same architecture, not two, expressed as two small classes rather than one
 * whose constructor would have to serve both protocols at once.
 */
export class Notifier<S> {
  #state: S = undefined as unknown as S;
  #mounted = true;
  #onChange: ((previous: S, next: S) => void) | undefined;
  #ref: Ref | undefined;

  /** The provider's own `Ref` — available from `build()` onward, never before (the container attaches it first). */
  get ref(): Ref {
    if (this.#ref === undefined) throw new Error('Bad state: `ref` is not available before `build()` runs.');
    return this.#ref;
  }

  get state(): S {
    return this.#state;
  }

  set state(next: S) {
    if (!this.#mounted) throw new Error('Bad state: Tried to use a Notifier after `dispose` was called.');
    const previous = this.#state;
    this.#state = next;
    if (!Object.is(previous, next)) this.#onChange?.(previous, next);
  }

  get mounted(): boolean {
    return this.#mounted;
  }

  dispose(): void {
    this.#mounted = false;
  }

  /** The container's hook; not part of the Dart surface. */
  [ATTACH](onChange: (previous: S, next: S) => void): void {
    this.#onChange = onChange;
  }

  /** The container's hook; not part of the Dart surface. Set exactly once, before `build()` runs. */
  [ATTACH_REF](ref: Ref): void {
    this.#ref = ref;
  }

  /** Overridden by the project's own subclass: computes the initial (and, on every rebuild, the next) state. */
  build(): S {
    throw new Error('Bad state: a `Notifier` subclass must override `build()`.');
  }
}

/**
 * `AutoDisposeNotifier<S>` — the `autoDispose`-flavoured base real Riverpod's own type system uses to keep
 * an `autoDispose` provider from being handed a `Notifier` that was not written for it (a compile-time
 * distinction Dart's own type checker enforces). Structurally and behaviourally identical here — this
 * runtime already tracks `autoDispose` on the *provider's* own definition (`ProviderOptions.autoDispose`),
 * independent of which of these two classes builds it — so subclassing is the whole of what "the
 * `autoDispose` flavour" needs to mean.
 */
export class AutoDisposeNotifier<S> extends Notifier<S> {}

/** The controller a `StateProvider` exposes as `.notifier`. */
export class StateController<S> {
  constructor(
    private value: S,
    private readonly changed: (previous: S, next: S) => void,
  ) {}
  get state(): S {
    return this.value;
  }
  set state(next: S) {
    const previous = this.value;
    this.value = next;
    if (!Object.is(previous, next)) this.changed(previous, next);
  }
  update(change: (state: S) => S): S {
    this.state = change(this.value);
    return this.value;
  }
}

// ── elements ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

interface Edge {
  readonly dependency: Element;
  readonly target: Listenable<unknown>;
  last: unknown;
}

interface Listener {
  readonly target: Listenable<unknown>;
  readonly callback: (previous: unknown, next: unknown) => void;
  last: unknown;
}

interface Deferred {
  readonly promise: Promise<unknown>;
  resolve(value: unknown): void;
  reject(error: unknown): void;
}

/** One provider's live state in one container. */
export class Element {
  value: unknown;
  built = false;
  disposed = false;
  /** Rebuild on next use: an invalidate, or a dependency that changed. */
  dirty = false;
  /** Something upstream may have changed; ask the dependencies before rebuilding. */
  stale = false;
  generation = 0;
  edges: Edge[] = [];
  readonly dependents = new Set<Element>();
  readonly listeners = new Set<Listener>();
  disposers: Array<() => void> = [];
  controller: StateController<unknown> | undefined;
  notifier: StateNotifier<unknown> | Notifier<unknown> | undefined;
  deferred: Deferred | undefined;
  subscription: { cancel(): unknown } | undefined;
  overridden: Override | undefined;

  constructor(
    readonly def: ProviderDef,
    readonly arg: unknown,
    readonly container: ProviderContainer,
  ) {}
}

/** Options for a container. */
export interface ContainerOptions {
  readonly overrides?: readonly Override[];
  readonly parent?: ProviderContainer;
}

function defer(): Deferred {
  let resolve!: (value: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // A rejection nobody awaits is still an error state, already delivered through the provider — not an unhandled rejection.
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}

/** `ProviderContainer`. */
export class ProviderContainer {
  private readonly elements = new Map<ProviderDef, Map<string, Element[]>>();
  private readonly order: Element[] = [];
  private readonly overrides = new Map<ProviderDef, Override>();
  private readonly parent: ProviderContainer | undefined;
  private flushScheduled = false;
  private building: Element | undefined;
  private disposed = false;

  constructor(options: ContainerOptions = {}) {
    this.parent = options.parent;
    for (const override of options.overrides ?? []) {
      if (override.target.def.family) throw new Error('Overriding a member of a family is not supported.');
      this.overrides.set(override.target.def, override);
    }
  }

  // ── public surface ─────────────────────────────────────────────────────────────────────────────────────────────────────

  /** `container.read`. */
  read<T>(target: Listenable<T>): T {
    const element = this.elementFor(target.source);
    this.ensureFresh(element);
    const value = target.pick(element);
    this.scheduleDisposeCheck(element);
    return value;
  }

  /** `container.listen`. */
  listen<T>(target: Listenable<T>, callback: (previous: T | null, next: T) => void, options: ListenOptions = {}): Subscription {
    const element = this.elementFor(target.source);
    this.ensureFresh(element);
    return this.subscribe(element, target, callback as Listener['callback'], options);
  }

  /**
   * Keeps `target`'s provider alive until the returned function is called — a listener that does nothing.
   *
   * For a caller that reads during a render and subscribes in a later effect: without it an `autoDispose` provider that only
   * `read` created would be disposed in the gap and built a second time when the effect subscribes.
   */
  hold(target: Listenable<unknown>): () => void {
    const element = this.elementFor(target.source);
    this.ensureFresh(element);
    return this.subscribe(element, target, () => undefined, {}).close;
  }

  /** `container.invalidate`. */
  invalidate(target: Listenable<unknown>): void {
    const element = this.existing(target.source);
    if (element === undefined) return;
    this.invalidateElement(element);
  }

  /** `container.refresh` — rebuilds now and returns the new value. */
  refresh<T>(target: Listenable<T>): T {
    const element = this.elementFor(target.source);
    if (element.built) this.invalidateElement(element);
    this.ensureFresh(element);
    return target.pick(element);
  }

  /** `container.dispose`. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const element of [...this.order]) this.disposeElement(element);
  }

  // ── lookup ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

  /** The container that holds `def`'s elements: the nearest one that overrides it, else the root. */
  private ownerOf(def: ProviderDef): ProviderContainer {
    if (this.overrides.has(def)) return this;
    return this.parent === undefined ? this : this.parent.ownerOf(def);
  }

  private existing(instance: ProviderInstance<unknown>): Element | undefined {
    const owner = this.ownerOf(instance.def);
    if (owner !== this) return owner.existing(instance);
    const bucket = this.elements.get(instance.def)?.get(instance.hasArg ? bucketOf(instance.arg) : '');
    return bucket?.find((e) => !instance.hasArg || dartEquals(e.arg, instance.arg));
  }

  private elementFor(instance: ProviderInstance<unknown>): Element {
    const owner = this.ownerOf(instance.def);
    if (owner !== this) return owner.elementFor(instance);
    const found = this.existing(instance);
    if (found !== undefined) return found;

    const element = new Element(instance.def, instance.arg, this);
    element.overridden = this.overrides.get(instance.def);
    let byKey = this.elements.get(instance.def);
    if (byKey === undefined) this.elements.set(instance.def, (byKey = new Map()));
    const key = instance.hasArg ? bucketOf(instance.arg) : '';
    const bucket = byKey.get(key);
    if (bucket === undefined) byKey.set(key, [element]);
    else bucket.push(element);
    this.order.push(element);
    return element;
  }

  // ── building ───────────────────────────────────────────────────────────────────────────────────────────────────────────

  /** Makes `element` current: built if new, rebuilt if dirty, and — if stale — rebuilt only when a dependency really changed. */
  private ensureFresh(element: Element): void {
    if (element.disposed) return;
    if (!element.built) {
      this.build(element, false);
      return;
    }
    if (element.dirty) {
      this.build(element, true);
      return;
    }
    if (!element.stale) return;

    for (const edge of element.edges) {
      edge.dependency.container.ensureFresh(edge.dependency);
      if (!edge.target.same(edge.last, edge.target.pick(edge.dependency))) {
        element.dirty = true;
        break;
      }
    }
    element.stale = false;
    if (element.dirty) this.build(element, true);
  }

  private build(element: Element, rebuild: boolean): void {
    const previous = element.value;
    if (rebuild) this.tearDown(element);
    element.dirty = false;
    element.stale = false;
    element.built = true;
    element.generation += 1;
    const generation = element.generation;

    const edges: Edge[] = [];
    const before = element.container.building;
    element.container.building = element;
    const ref = this.refFor(element, edges);
    try {
      this.run(element, ref, generation, rebuild, previous);
    } finally {
      element.container.building = before;
    }
    element.edges = edges;
    for (const edge of edges) edge.dependency.dependents.add(element);
    if (!rebuild) this.scheduleDisposeCheck(element);
  }

  private run(element: Element, ref: Ref, generation: number, rebuild: boolean, previous: unknown): void {
    const def = element.def;
    const override = element.overridden;

    if (override?.hasValue === true && def.kind !== 'future' && def.kind !== 'stream') {
      this.assign(element, override.value, rebuild, previous);
      return;
    }
    const create = (override?.create ?? def.create) as (ref: Ref, arg?: unknown) => unknown;
    const make = (): unknown => (def.family ? create(ref, element.arg) : create(ref));

    switch (def.kind) {
      case 'provider':
        this.assign(element, make(), rebuild, previous);
        return;

      case 'state': {
        const initial = make();
        element.controller = new StateController<unknown>(initial, (before, now) => {
          element.value = now;
          this.sourceChanged(element, before);
        });
        this.assign(element, initial, rebuild, previous);
        return;
      }

      case 'stateNotifier': {
        const notifier = make() as StateNotifier<unknown>;
        element.notifier = notifier;
        notifier[ATTACH]((before, now) => {
          if (element.notifier !== notifier || element.disposed) return;
          element.value = now;
          this.sourceChanged(element, before);
        });
        element.disposers.push(() => notifier.dispose());
        this.assign(element, notifier.state, rebuild, previous);
        return;
      }

      case 'notifier': {
        // `create` is a zero-argument factory (`DiscoverDeck.new`'s own runtime shape — `() => new
        // DiscoverDeck()`), never `(ref) => …`: `Notifier`'s own `ref` is attached *after* construction,
        // not passed to it (`Notifier`'s own doc, above) — so this bypasses `make()`, which always calls
        // `create(ref)`, and calls the factory directly instead.
        const factory = create as unknown as () => Notifier<unknown>;
        const notifier = factory();
        notifier[ATTACH_REF](ref);
        // `build()`'s own return is the initial state — assigned through the ordinary `state` setter (its
        // own `#onChange` is not attached yet, so this cannot notify anyone early), exactly as
        // `StateNotifier`'s own Dart constructor already sets its initial state before this container ever
        // sees the instance. `build()` runs with `ref` already attached and this element already the one
        // `element.container.building` names (set by `this.build`, above `run`), so a `ref.watch`/`.listen`
        // inside it is tracked as this provider's own dependency, the same as any other kind's `create`.
        notifier.state = notifier.build();
        element.notifier = notifier;
        notifier[ATTACH]((before, now) => {
          if (element.notifier !== notifier || element.disposed) return;
          element.value = now;
          this.sourceChanged(element, before);
        });
        element.disposers.push(() => notifier.dispose());
        this.assign(element, notifier.state, rebuild, previous);
        return;
      }

      case 'future':
      case 'stream':
        this.runAsync(element, make, generation, rebuild, previous as AsyncValue<unknown> | undefined);
        return;
    }
  }

  private runAsync(
    element: Element,
    make: () => unknown,
    generation: number,
    rebuild: boolean,
    previous: AsyncValue<unknown> | undefined,
  ): void {
    const deferred = defer();
    element.deferred = deferred;
    const current = (): boolean => !element.disposed && element.generation === generation;
    const settle = (next: AsyncValue<unknown>): void => {
      if (!current()) return;
      const before = element.value as AsyncValue<unknown>;
      element.value = next;
      this.asyncChanged(element, before);
    };
    const base = (): AsyncValue<unknown> => (element.value as AsyncValue<unknown> | undefined) ?? AsyncValue.loading();

    let source: unknown;
    let threw = false;
    let thrown: unknown;
    try {
      source = make();
    } catch (error) {
      threw = true;
      thrown = error;
    }

    // The loading value is published *after* `create` has run: a rebuild's first observable event is the body running.
    const loading = previous === undefined ? AsyncValue.loading<unknown>() : AsyncValue.loadingFrom(previous, true);
    element.value = loading;

    if (threw) {
      element.value = AsyncValue.errorFrom(loading, thrown);
      deferred.reject(thrown);
      if (rebuild) this.asyncChanged(element, previous ?? loading);
      return;
    }
    if (rebuild && previous !== undefined && !previous.$eq(loading)) this.notify(element, previous);

    if (element.def.kind === 'future') {
      Promise.resolve(source).then(
        (value) => {
          if (!current()) return;
          deferred.resolve(value);
          settle(AsyncValue.data(value));
        },
        (error: unknown) => {
          if (!current()) return;
          deferred.reject(error);
          settle(AsyncValue.errorFrom(base(), error));
        },
      );
      return;
    }

    const stream = source as StreamLike<unknown> | AsyncIterable<unknown>;
    if (typeof (stream as StreamLike<unknown>).listen === 'function') {
      const subscription = (stream as StreamLike<unknown>).listen(
        (value) => {
          if (!current()) return;
          deferred.resolve(value);
          settle(AsyncValue.data(value));
        },
        (error) => {
          if (!current()) return;
          settle(AsyncValue.errorFrom(base(), error));
        },
      );
      element.subscription = subscription;
    } else {
      let cancelled = false;
      element.subscription = { cancel: () => (cancelled = true) };
      void (async () => {
        try {
          for await (const value of stream as AsyncIterable<unknown>) {
            if (cancelled || !current()) return;
            deferred.resolve(value);
            settle(AsyncValue.data(value));
          }
        } catch (error) {
          if (!cancelled && current()) settle(AsyncValue.errorFrom(base(), error));
        }
      })();
    }
  }

  /** Stores a synchronously built value, and notifies if this was a rebuild that changed it. */
  private assign(element: Element, value: unknown, rebuild: boolean, previous: unknown): void {
    element.value = value;
    if (rebuild && !element.def.equals(previous, value)) this.notify(element, previous);
  }

  /** Runs what a rebuild or a disposal must undo: `onDispose` callbacks, subscriptions, edges. */
  private tearDown(element: Element): void {
    const disposers = element.disposers;
    element.disposers = [];
    for (const dispose of disposers) dispose();
    element.subscription?.cancel();
    element.subscription = undefined;
    for (const edge of element.edges) {
      edge.dependency.dependents.delete(element);
      edge.dependency.container.scheduleDisposeCheck(edge.dependency);
    }
    element.edges = [];
  }

  private refFor(owner: Element, edges: Edge[]): Ref {
    const live = (): void => {
      if (owner.disposed) throw new Error('Bad state: this `ref` was used after its provider was disposed.');
    };
    return {
      watch: <T>(target: Listenable<T>): T => {
        live();
        const dependency = this.elementFor(target.source);
        dependency.container.ensureFresh(dependency);
        const value = target.pick(dependency);
        if (!edges.some((e) => e.dependency === dependency && e.target === target)) {
          edges.push({ dependency, target, last: value });
        }
        return value;
      },
      read: <T>(target: Listenable<T>): T => {
        live();
        const dependency = this.elementFor(target.source);
        dependency.container.ensureFresh(dependency);
        return target.pick(dependency);
      },
      listen: <T>(target: Listenable<T>, callback: (previous: T | null, next: T) => void, options?: ListenOptions): Subscription => {
        live();
        const dependency = this.elementFor(target.source);
        dependency.container.ensureFresh(dependency);
        const subscription = dependency.container.subscribe(dependency, target, callback as Listener['callback'], options ?? {});
        owner.disposers.push(() => subscription.close());
        return subscription;
      },
      invalidate: (target) => {
        live();
        this.invalidate(target);
      },
      refresh: <T>(target: Listenable<T>): T => {
        live();
        return this.refresh(target);
      },
      onDispose: (callback) => {
        live();
        owner.disposers.push(callback);
      },
    };
  }

  // ── change propagation ─────────────────────────────────────────────────────────────────────────────────────────────────

  /** A source changed value (`state = x`): its listeners hear it now; whatever depends on it is recomputed later. */
  private sourceChanged(element: Element, previous: unknown): void {
    this.notify(element, previous);
    this.markStale(element);
    this.scheduleFlush();
  }

  /** An async provider's value changed (a result arrived). */
  private asyncChanged(element: Element, previous: unknown): void {
    if (!(previous as AsyncValue<unknown>).$eq(element.value)) this.notify(element, previous);
    this.markStale(element);
    this.scheduleFlush();
  }

  private invalidateElement(element: Element): void {
    element.dirty = true;
    this.markStale(element);
    this.scheduleFlush();
  }

  /** Everything downstream of `element` may be out of date. */
  private markStale(element: Element): void {
    for (const dependent of element.dependents) {
      if (dependent.stale) continue;
      dependent.stale = true;
      dependent.container.markStale(dependent);
    }
  }

  private notify(element: Element, previous: unknown): void {
    void previous;
    for (const listener of [...element.listeners]) {
      if (!element.listeners.has(listener)) continue;
      const next = listener.target.pick(element);
      if (listener.target.same(listener.last, next)) continue;
      const before = listener.last;
      listener.last = next;
      listener.callback(before, next);
    }
  }

  private scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    queueMicrotask(() => {
      this.flushScheduled = false;
      // Only what someone is listening to is brought up to date; the rest stays lazy until it is read.
      for (const element of [...this.order]) {
        if (element.listeners.size > 0 && (element.dirty || element.stale)) this.ensureFresh(element);
      }
    });
    // A container with a parent or children shares no queue: elements notify through their own owner's container.
  }

  // ── listening and disposal ─────────────────────────────────────────────────────────────────────────────────────────────

  private subscribe(element: Element, target: Listenable<unknown>, callback: Listener['callback'], options: ListenOptions): Subscription {
    const listener: Listener = { target, callback, last: target.pick(element) };
    element.listeners.add(listener);
    if (options.fireImmediately === true) callback(null, listener.last);
    return {
      close: () => {
        if (!element.listeners.delete(listener)) return;
        element.container.scheduleDisposeCheck(element);
      },
      read: () => {
        element.container.ensureFresh(element);
        return target.pick(element);
      },
    };
  }

  private scheduleDisposeCheck(element: Element): void {
    if (!element.def.autoDispose) return;
    queueMicrotask(() => {
      if (!element.disposed && element.listeners.size === 0 && element.dependents.size === 0) this.disposeElement(element);
    });
  }

  private disposeElement(element: Element): void {
    if (element.disposed) return;
    element.disposed = true;
    this.tearDown(element);
    element.deferred?.resolve(undefined);
    const owner = element.container;
    owner.order.splice(owner.order.indexOf(element), 1);
    const byKey = owner.elements.get(element.def);
    const key = element.def.family ? bucketOf(element.arg) : '';
    const bucket = byKey?.get(key);
    if (bucket !== undefined) {
      const at = bucket.indexOf(element);
      if (at >= 0) bucket.splice(at, 1);
      if (bucket.length === 0) byKey?.delete(key);
    }
  }
}

// ── the exact classes riverpod's programs construct ──────────────────────────────────────────────────────────────────────────
//
// `Provider<T>((ref) => value)`, `StateProvider<T>((ref) => initial)`, `StateNotifierProvider<N, S>((ref) => N())`: the shapes a
// program actually writes. Named and shaped identically to the real package's, because the generator lowers a construction of a
// kit-mirrored type by importing the kit's export of the *same name* (`package_kit.ts`, ADR-0075's mechanism) — the same one
// `Dio`/`BaseOptions` already use. Each is a thin `ProviderInstance`; nothing here differs from `defineProvider` except the name.

/** `Provider<T>((ref) => value)`. */
export class Provider<T> extends ProviderInstance<T> {
  constructor(create: (ref: Ref) => T, options: ProviderOptions = {}) {
    super(new ProviderDef('provider', create as ProviderDef['create'], options.autoDispose ?? false, options.name, false), undefined, false);
  }
}

/** `StateProvider<T>((ref) => initial)`. */
export class StateProvider<T> extends ProviderInstance<T> {
  constructor(create: (ref: Ref) => T, options: ProviderOptions = {}) {
    super(new ProviderDef('state', create as ProviderDef['create'], options.autoDispose ?? false, options.name, false), undefined, false);
  }

  /** `filterProvider.notifier` — a `StateController<T>`: `ref.read(filterProvider.notifier).state = next`. */
  override get notifier(): Listenable<StateController<T>> {
    return super.notifier as Listenable<StateController<T>>;
  }
}

/**
 * `StateNotifierProvider<N extends StateNotifier<S>, S>((ref) => N())`.
 *
 * Two type parameters, matching Dart's own signature exactly (`typeTextOf`, `package_kit.ts`, emits this
 * type text verbatim from `StateNotifierProvider<N, S>` — no special-casing needed to drop one). `N` is
 * not `unknown`-erased: `.notifier` returns `Listenable<N>`, the *concrete* notifier subclass, which is
 * what lets `ref.read(counterProvider.notifier).increment()` see `increment` at all — the state's own
 * base class `StateNotifier<S>` does not declare it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the constraint bound, not a value's own type; see the class's own doc.
export class StateNotifierProvider<N extends StateNotifier<any>> extends ProviderInstance<
  N extends StateNotifier<infer S> ? S : never
> {
  // One type parameter, not two, even though Dart's own `StateNotifierProvider<N, S>` has two (`types.ts`
  // omits a top-level constant's own type annotation when it cannot soundly compose one — a project class
  // used as a kit generic's own argument, `docs/m14/riverpod-usage-matrix.md` §"Known gaps" — so the
  // constructor call is the *only* place either parameter is ever determined, and inference is what has to
  // carry both). `S` is *derived* from `N` (`infer`) rather than declared alongside it, so only `N` — which
  // appears directly in `create`'s own return position — needs to be inferred at all.
  //
  // The bound is `StateNotifier<any>`, not `StateNotifier<unknown>` — found live, the hard way: the runtime's
  // own `StateNotifier` carries a private `#onChange: ((previous: T, next: T) => void) | undefined` field, and
  // a function parameter is contravariant, so `StateNotifier<number>` is *not* a structural subtype of
  // `StateNotifier<unknown>` (a `(number, number) => void` cannot stand in for a `(unknown, unknown) => void`)
  // — every real subclass failed this class's own constraint check, silently doing nothing but reject every
  // real use. `any` is exempt from that variance check on both sides, which is exactly what a bound that
  // exists only to say "some `StateNotifier`, whichever" needs.
  constructor(create: (ref: Ref) => N, options: ProviderOptions = {}) {
    super(new ProviderDef('stateNotifier', create as ProviderDef['create'], options.autoDispose ?? false, options.name, false), undefined, false);
  }

  /** `counterProvider.notifier` — the concrete notifier instance: `ref.read(counterProvider.notifier).increment()`. */
  override get notifier(): Listenable<N> {
    return super.notifier as Listenable<N>;
  }
}

/**
 * `NotifierProvider<N extends Notifier<S>, S>(Ctor.new)` — Riverpod 2's own successor to
 * `StateNotifierProvider`, and `AutoDisposeNotifierProvider`'s identical shape (this runtime tracks
 * `autoDispose` on the provider's own definition, not through a separate class — `Notifier`'s own doc).
 * `create` is a zero-argument factory, never `(ref) => N` — `N`'s own `ref` is attached after
 * construction (`ProviderContainer`'s own `'notifier'` case) — otherwise the identical shape
 * `StateNotifierProvider` is, for the identical reason: `N` is not `unknown`-erased, so
 * `ref.read(deckProvider.notifier).bump()` sees `bump` at all.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the constraint bound, not a value's own type; see `StateNotifierProvider`'s own doc.
export class NotifierProvider<N extends Notifier<any>> extends ProviderInstance<N extends Notifier<infer S> ? S : never> {
  constructor(create: () => N, options: ProviderOptions = {}) {
    super(new ProviderDef('notifier', create as ProviderDef['create'], options.autoDispose ?? false, options.name, false), undefined, false);
  }

  /** `deckProvider.notifier` — the concrete notifier instance: `ref.read(deckProvider.notifier).bump()`. */
  override get notifier(): Listenable<N> {
    return super.notifier as Listenable<N>;
  }
}

/**
 * `FutureProvider<T>((ref) async => value)`. What a watcher reads is `AsyncValue<T>`, not `T` — the loading/
 * data/error wrapper real Riverpod's own `FutureProvider` reads as (`async_value.ts`; recorded from the real
 * package, `fixtures/riverpod_oracle`) — so this is `ProviderInstance<AsyncValue<T>>`, not `ProviderInstance<T>`.
 * `T` is still inferred from `create`'s own return (`Promise<T> | T`: Dart's `async` body and a bare
 * synchronous return are both legal `create` bodies for a `FutureProvider`), exactly as `Provider<T>` infers
 * `T` from its own `create` — nothing here re-derives `AsyncValue`'s own shape; `runAsync` (this file, above)
 * already builds it, for every `future`-kind element, family or not.
 */
export class FutureProvider<T> extends ProviderInstance<AsyncValue<T>> {
  constructor(create: (ref: Ref) => Promise<T> | T, options: ProviderOptions = {}) {
    super(new ProviderDef('future', create as ProviderDef['create'], options.autoDispose ?? false, options.name, false), undefined, false);
  }
}

/** `StreamProvider<T>((ref) => stream)` — a watcher reads `AsyncValue<T>`, the same wrapper {@link FutureProvider} reads. */
export class StreamProvider<T> extends ProviderInstance<AsyncValue<T>> {
  constructor(create: (ref: Ref) => StreamLike<T>, options: ProviderOptions = {}) {
    super(new ProviderDef('stream', create as ProviderDef['create'], options.autoDispose ?? false, options.name, false), undefined, false);
  }
}

/** `StateProvider.family<T, A>((ref, arg) => initial)` — the family form of {@link StateProvider}, with the identical typed `.notifier`. */
class StateFamilyInstance<T> extends ProviderInstance<T> {
  override get notifier(): Listenable<StateController<T>> {
    return super.notifier as Listenable<StateController<T>>;
  }
}
export function defineStateFamily<T, A>(create: (ref: Ref, arg: A) => T, options: ProviderOptions = {}): ((arg: A) => StateFamilyInstance<T>) & { readonly def: ProviderDef } {
  return familyOf<A, StateFamilyInstance<T>>('state', create as ProviderDef['create'], options, (def, arg) => new StateFamilyInstance<T>(def, arg, true));
}

/** `StateNotifierProvider.family<N, S, A>((ref, arg) => N())` — the family form of {@link StateNotifierProvider}, with the identical typed `.notifier`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the constraint bound, not a value's own type; see `StateNotifierProvider`'s own doc.
class StateNotifierFamilyInstance<N extends StateNotifier<any>> extends ProviderInstance<
  N extends StateNotifier<infer S> ? S : never
> {
  override get notifier(): Listenable<N> {
    return super.notifier as Listenable<N>;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above.
export function defineStateNotifierFamily<N extends StateNotifier<any>, A>(
  create: (ref: Ref, arg: A) => N,
  options: ProviderOptions = {},
): ((arg: A) => StateNotifierFamilyInstance<N>) & { readonly def: ProviderDef } {
  return familyOf<A, StateNotifierFamilyInstance<N>>('stateNotifier', create as ProviderDef['create'], options, (def, arg) => new StateNotifierFamilyInstance<N>(def, arg, true));
}
