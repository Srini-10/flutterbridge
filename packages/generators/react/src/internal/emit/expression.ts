// The expression emitter — `logic.*` Expr → TypeScript.
//
// ## This is where Dart stops being Dart
//
// ADR-19 draws the line the whole platform rests on: **structure is data, behaviour is closures**. The
// runtime kit never interprets `logic.*`, because interpreting it would mean shipping Dart's evaluation
// semantics to the browser and re-implementing them in every future kit. So the semantics get resolved
// exactly once — here, at compile time, into real TypeScript.
//
// That makes this file the one place in the React target where Dart and JavaScript disagree about what an
// operator *means*, and where getting it wrong is silent. The schema's own doc comments record the traps, and
// they are not hypothetical: `logic.Assign`'s documentation says `truncatingDivideAssign` needs
// `Math.trunc(a / b)`, and that *"Dart's modulo is always non-negative for a positive divisor; JavaScript's
// `%` is not"*. `-7 % 3` is `2` in Dart and `-1` in JavaScript. A generator that emits `%` for `%` produces
// an application that computes the wrong number, on some inputs, forever.
//
// ## Why a visitor and not a switch on `kind` scattered about
//
// Every `Expr` variant is handled in one place, so "did we handle `logic.Cast`?" is answerable by reading one
// function. The default branch reports `BRG3002` rather than falling through to something plausible: an
// expression the generator cannot lower is an expression whose value it would have to invent.

import type { AnyUirNode, Expr, NodeId } from '@bridge/uir';

import { GeneratorDiagnosticCode } from '../diagnostics/codes.js';
import { identifierOf, type ModuleBuilder } from './module.js';
import { RUNTIME_MODULE as RUNTIME, isKitProvided } from './runtime.js';
import { typeTextOf } from './types.js';
import { OWNER_LABEL, missingCapabilityOf } from './unsupported.js';


/** What an expression needs in order to be lowered. */
export interface EmitScope {
  /** The file being written. */
  readonly module: ModuleBuilder;
  /** Reports a finding. */
  report(code: string, severity: 'error' | 'warning' | 'info', message: string, nodeId?: string): void;
  /**
   * The identifier of the component's router, when its tree performs a navigation (ADR-0025 D2).
   *
   * `useRouter()` is a **hook**, so it cannot be called at the navigation site — the corpus writes
   * navigation as `onPressed: () => Navigator.pop(context)`, and a hook inside a callback is a
   * rules-of-hooks violation React throws on at runtime rather than one `tsc` catches. It is hoisted to
   * the component body exactly as `useSignal` is, and the call site reads this name.
   *
   * Absent when the component navigates nowhere, so such a component declares no router and imports
   * nothing for one — the emitted file says what the component actually does.
   */
  readonly routerLocal?: string;
  /**
   * The identifier of this component's `useSnackbarHost()`, when its tree (or an action it references)
   * calls a recognized `ScaffoldMessenger`-family method (ADR-0030) — hoisted for the same rules-of-hooks
   * reason {@link routerLocal} is: the call is almost always inside a callback (`onPressed: () {
   * ScaffoldMessenger.of(context).showSnackBar(...); }`), and `useSnackbarHost()` is a hook.
   *
   * Absent when the component presents no snack bar, so such a component declares no hook and imports
   * nothing for one.
   */
  readonly snackbarHostLocal?: string;
  /**
   * Whether this program constructs a `ScaffoldMessenger` widget anywhere (ADR-0030 §10) — computed once,
   * program-wide, in `pipeline.ts`'s `rootScope`. `true` makes every recognized `ScaffoldMessenger`-family
   * call refuse: a nested messenger is an observably distinct Flutter scope this decision does not model,
   * and the analyzer has no structural way to tell which particular call site it affects (reduction-ladder
   * rung G14), so the refusal is whole-program rather than an unsound guess at which calls are "near" it.
   */
  readonly hasNestedScaffoldMessenger?: boolean;
  /**
   * The identifier of the component's `useMounted()` ref, when its tree reads `logic.Intrinsic`
   * (ADR-0026) — `mounted` or `context.mounted`, however many times.
   *
   * `useMounted()` is a hook, hoisted to the component body for the same rules-of-hooks reason
   * {@link routerLocal} is: the read is often inside a callback (`onPressed: () async { if (!mounted)
   * return; ... }`), and a hook at that call site would be a runtime violation `tsc` does not catch.
   *
   * Absent when the component reads no intrinsic, so such a component imports nothing for one.
   */
  readonly mountedLocal?: string;
  /**
   * The `DialogHostHandle` ref local for the `app.RouteTransition` (an inline route-overlay destination,
   * M9-D) named by `id`, if the component reaches one.
   *
   * A lookup by transition id, not a bare local like {@link routerLocal} — a component may reach more
   * than one inline destination (two different `showDialog` calls), and each needs its own ref. Declared
   * and rendered together in `component.ts`'s own `declareDialogHosts`, for the identical
   * rules-of-hooks/one-name-answers-every-read reason `routerLocal` is.
   */
  dialogRefFor?(id: NodeId): string | undefined;
  /**
   * Renders [node] — a `ui.Element` — as JSX, for a widget reached *outside* the ordinary component
   * render tree (ADR-0030): a `SnackBar`'s own `content:` argument, extracted through the real
   * widget-tree extractor the same way M9-D's inline dialog destinations already are (`component.ts`'s
   * own `emitUiNode`, which this forwards to).
   *
   * A method taking the *caller's own* `scope` back as an explicit argument, rather than a closure that
   * captures one at wiring time, because `module` is replaced per component/file (`{ ...scope, module
   * }`, `pipeline.ts`) — a closure fixed at root-scope construction would forward stale imports to the
   * wrong file. `expression.ts` cannot import `emitUiNode` directly (`component.ts` imports
   * `expression.ts`, not the reverse), so this is wired once, in `pipeline.ts`'s `rootScope`, as a bare
   * forwarding call — the same import-direction reason {@link dialogRefFor}'s own sibling hooks on the
   * Dart side of this decision are functions rather than fields.
   *
   * Absent when the hook is unwired (a unit test of this emitter alone).
   */
  renderWidget?(node: Node, depth: number, scope: EmitScope): string;
  /**
   * The local expression that reads a signal declared by `id`, if one is in scope.
   *
   * A `logic.Ref` whose target is a `sig.Signal` must become `count.get()`, not `count` — the signal is an
   * object, and emitting the object where its value belongs produces `[object Object]` on screen. The
   * component and store emitters populate this; the expression emitter only asks.
   */
  signalRead(id: NodeId): string | undefined;
  /**
   * The identifier of the signal *object* declared by `id`, if one is in scope.
   *
   * Distinct from {@link signalRead}, which is the expression that reads its **value** — and in render
   * position that is a subscribed local rather than anything derived from this name. Writing needs the
   * object (`count.set(…)`, `count.peek()`); rendering needs the value.
   *
   * This exists because the two were previously recovered from one string: `signalName` took
   * `signalRead(id)` and stripped a trailing `.get()`. That worked only while every read had that exact
   * shape, and it silently produced the wrong identifier the moment one did not.
   */
  signalLocal(id: NodeId): string | undefined;
  /** The local name a declaration was bound to, if it is in scope (a param, a local, a lifted action). */
  localName(id: NodeId): string | undefined;
  /**
   * Whether `id` is a member (`signals`/`derived`/`actions`) of some `app.Store` in the program.
   *
   * A component's own emitter has no working path to consume a store member it was not already
   * wired to — `useStore(...)` is not yet established for an arbitrary component (M7-E3 finding).
   * This exists so a caller can refuse an unreachable store reference explicitly, through the same
   * "not declared in this program" diagnostic an ordinary unresolved reference already gets, rather
   * than silently emitting a bare identifier no import ever declares.
   */
  isStoreOwned(id: NodeId): boolean;
  /**
   * The parameter of this name, if one is in scope.
   *
   * A `ParamDecl` has no `id` — it is a value, not a node — so a `logic.Ref` to a parameter carries a `name`
   * and no `target`, and resolution is **by name, within the action's scope** (Spec v2.5 §A18.3). That is
   * ordinary lexical scoping and not an inference: the parameter is declared, on the action, by the source.
   *
   * It is asked *after* `target`, so a signal named `id` and a parameter named `id` resolve the way Dart
   * would — the parameter shadows nothing it should not, because a signal read carries a target and a
   * parameter read does not.
   */
  paramInScope(name: string): string | undefined;
  /**
   * The name the *program* gives a declaration, recovered from the references to it.
   *
   * `sig.Signal` and `sig.Action` carry no `name`: they are symbol-addressed declarations (ADR-17) and the
   * symbol never reaches the document. But every `logic.Ref` that reads one carries both `target` and the
   * `name` the author wrote, so the program does state it — just not on the declaration. Without this a store
   * emits `value_d18f644e` where the source said `_favoriteIds`, which compiles and is unreviewable.
   */
  declaredName(id: NodeId): string | undefined;

  /**
   * Whether the program declares a class by this name that the generator emits.
   *
   * Always `false` today: M3-B emits no `logic.ClassDecl`, which is why a user type in a parameter position
   * lowers to `unknown`. It is a question rather than a constant so that the day class emission exists, the
   * refusal in `logic.New` lifts by itself instead of having to be found.
   */
  declaresClass(name: string): boolean;
  /** Looks a node up by id. */
  node(id: NodeId): AnyUirNode | undefined;
  /**
   * Every Material role the program's `app.Token` set resolves — by `role`, and by `name` for the tokens N10
   * derives (which set both to the same string).
   *
   * The build-time half of INV-20. A `WidgetMapping` declares the roles its component paints, and
   * `checkCapabilities` asks this set whether the program can supply them; a widget that paints a role no
   * token defines is refused (`BRG3010`) rather than emitted to throw `BRG4006` in a browser.
   *
   * Program-wide and computed once, because the token set is the same for every file.
   */
  readonly themeRoles: ReadonlySet<string>;
  /**
   * Every `app.Store` member (signal, derived value, or action) reachable in the program, by id — the
   * ownership a component needs to consume one through `useStore` (M7-F).
   *
   * Built once, from exactly the name each member was actually given when its owning store was emitted
   * (`store.ts`'s `emitStore` returns these maps; nothing here recomputes a name independently, which
   * would risk a second naming rule drifting from the first). Ownership is `target`/id-derived — this
   * map is keyed by the member's own `NodeId` — never inferred from a signal's or action's human name,
   * a store name coincidence, or declaration order.
   */
  readonly storeMembers: ReadonlyMap<NodeId, StoreMemberInfo>;
  /**
   * Every `app.Store`'s own module and export name, by the store's own id — what a locally-owned
   * instance (`app.StoreInstance`, ADR-27) needs to import to call `useLocalStore(...)`, independent of
   * any particular member. Built alongside {@link storeMembers}, from the same `emitStore` call.
   */
  readonly storeExports: ReadonlyMap<NodeId, { readonly module: string; readonly export: string }>;
  /**
   * Every project-declared `ui.Component`'s own module and export name, keyed by its anchor
   * (`` `${file}#${name}` `` — the same string a `ui.Element.component`'s `library`+`name` pair
   * reconstructs) — what a reference to a *sibling* component, anywhere in an ordinary render tree,
   * needs to import and render (M8-F).
   *
   * `file` is a project-relative path for the project's own component, or a `package:<name>/…` URI for
   * one declared in a local dependency (`ProjectInfo.dependencyLibraryFiles`'s own shape, unchanged
   * all the way through) — the two can never collide, so this map needs no separate notion of package
   * ownership: the anchor string already carries it. Built once, before any component is emitted, so
   * a component processed early in the program's fixed order can still reference one processed later.
   */
  readonly componentModules: ReadonlyMap<string, { readonly module: string; readonly name: string }>;
  /**
   * Every reachable, self-contained project-defined top-level `logic.FunctionDecl` this program actually
   * emits, keyed by its own declaration id (ADR-29, M8-U) — what a targeted `logic.Ref` to one needs to
   * resolve to: the file it lives in (`path`, for telling a same-file call from a cross-file one), the
   * `@/`-aliased specifier a *different* file imports it by (`module`), and its own reserved local name.
   * Absent for a function this generator does not (yet) lower — async, no body, or a body that itself
   * references something unsupported — which is not a failure of this lookup; it is the honest fact that
   * lets the existing `logic.Ref` case fall through to its own, unchanged `BRG3013` refusal. Built once,
   * before any component or function is finally committed, the same way `componentModules` already is.
   */
  readonly functionModules: ReadonlyMap<NodeId, { readonly path: string; readonly module: string; readonly name: string }>;
  /**
   * The resolved expression for a `logic.PropertyAccess` whose `target` names a signal/derived member of
   * a *locally-owned* store instance (ADR-27) — `favorites.favoriteCount` where `favorites` is this
   * component's own `useLocalStore(...)`.
   *
   * Keyed by the `PropertyAccess` node's **own id**, not by `target`: `target` alone cannot distinguish
   * `left.count` from `right.count` when both are the same store type's `count`, since the member they
   * name is one shared declaration — the receiver is what differs, and a `PropertyAccess` node's content
   * (receiver included) already gives it a distinct id per (instance, member) pair, by construction
   * (ADR-17). Absent for an ordinary property access, or one whose `target` names an action (a tear-off
   * needs no subscription — it is called, not read).
   *
   * @param id - the `PropertyAccess` node's own id.
   * @returns the resolved expression, or `undefined` to fall through to ordinary `receiver.property` lowering.
   */
  storeAccessRead(id: NodeId): string | undefined;
}

/**
 * Where a promoted or declared `app.Store` member lives, and what a consumer outside the store calls it
 * (M7-F).
 */
export interface StoreMemberInfo {
  /** Which kind of member — a `useSignal`-subscribable read (`signal`/`derived`) or a direct call (`action`). */
  readonly kind: 'signal' | 'derived' | 'action';
  /** The `app.Store` node id this member belongs to. */
  readonly storeId: NodeId;
  /** The store's own module, to import from — e.g. `@/stores/favorites-store`. */
  readonly storeModule: string;
  /** The store's exported `defineStore` identifier — e.g. `favoritesStoreStore`. */
  readonly storeExport: string;
  /** This member's property on what the store's setup function returned — e.g. `value_d18f644e`. */
  readonly property: string;
}

/** A `logic.*` node, loosely typed: the generated union does not expose nested nodes as `AnyUirNode`. */
type Node = Record<string, unknown>;

/**
 * Whether `holder` is the class Flutter hangs `type`'s named constants off.
 *
 * Flutter's convention is a plural or `-s` holder for a singular value type: `Curves` holds `Curve`s,
 * `Colors` holds `Color`s, `Icons` holds `IconData`. Checked rather than assumed — a bare "the prefix is
 * some Flutter class" test would rewrite any Flutter-typed reference into a member access that does not
 * exist, which is the failure the narrower `prefix === typeName` check was protecting against.
 */
function isHolderOf(holder: string, type: string): boolean {
  return holder === `${type}s` || holder === `${type}es`;
}

/**
 * What an emitter returns when it has refused an expression and reported why.
 *
 * `'undefined'` is the text, and it is deliberately the same text a genuine Dart `null` lowers to: nothing is
 * emitted from a refused program (the pipeline discards every file once an `error` is reported), so this
 * value never reaches a file. Naming it makes "did this sub-expression refuse?" a check a caller can make,
 * which is what stops one refusal becoming one diagnostic per argument.
 */
const REFUSED = 'undefined';

/**
 * Whether `type` is `dart:core`'s own `Duration`, `int`, `double`, or `num` — checked by the type's own
 * **resolved library**, never by its bare name (M8-V). A project-defined class also named `Duration`
 * resolves to the project's own package URI, never `dart:core`; confirmed directly against real
 * Continuum evidence (no such class exists there) and against a dedicated negative-control fixture
 * (`numeric_sdk_recognition.test.ts`) — the check does not rely on either,
 * it is sound by construction, the identical test `runtime.ts`'s `isKitProvided` and `types.ts`'s
 * `typeTextOf` already use for the same reason.
 */
function sdkTypeOf(type: Node | undefined): string | undefined {
  const library = type?.['library'];
  const rawName = type?.['name'];
  if (typeof library !== 'string' || library !== 'dart:core' || typeof rawName !== 'string') return undefined;
  return rawName.endsWith('?') ? rawName.slice(0, -1) : rawName;
}

/**
 * Whether `receiver` is a **parameter** read — a bare `logic.Ref` with no `target` that resolves through
 * `scope.paramInScope` (a component prop, or an action/function parameter) — the *only* UIR shape whose
 * emitted TypeScript type is actually `typeTextOf(type)` (M9-J). A `target`-bearing `Ref` is a local
 * variable, a signal, a store instance, an enum constant, or a top-level declaration — every one of those
 * is excluded here (`target !== undefined` returns `false` immediately) because none of them carry an
 * explicit type annotation in the generated output: `statement.ts`'s own `logic.VarDecl` emission never
 * writes one (`const/let ${name} = ${initializer};`, confirmed directly — no type text anywhere), so a
 * local's real TypeScript type is whatever `tsc` infers from its initializer, which is very often *not*
 * `unknown` even when the identical `TypeRef` would be, in a parameter position. A real build-proof fixture
 * found this the hard way: `const List<String> units = [...]; ... units.length` — `List<String>` maps to
 * `unknown` via `typeTextOf` exactly like a project-defined class does, but `units` is a local initialized
 * from an array literal, so `tsc` infers `string[]` for it and `.length` is genuinely, already safe. Only a
 * receiver whose type annotation this generator itself wrote — a parameter — is the shape this milestone
 * closes; a project-class value that has passed through a local variable is a real, separate, narrower gap
 * this milestone does not close (see the milestone doc's own remaining-blocker graph).
 */
function isParameterReceiver(receiver: Node | undefined, scope: EmitScope): boolean {
  if (receiver === undefined || kindOf(receiver) !== 'logic.Ref') return false;
  if (receiver['target'] !== undefined) return false;
  const name = receiver['name'];
  return typeof name === 'string' && scope.paramInScope(name) !== undefined;
}

/**
 * Whether `type` names a member-bearing type this generator has no model for (M9-J) — a project-defined or
 * external-package class or enum, or an unrecognized SDK collection type. Reusing `typeTextOf` (`types.ts`)
 * rather than a second classification table is deliberate: `unknown` in a generated prop type and "this
 * generator cannot answer a member read on it" are the same fact, stated once. Only meaningful for a
 * receiver `isParameterReceiver` already confirmed is actually typed this way in the generated output — see
 * that function's own comment for why a local variable's identical `TypeRef` does not imply the same thing.
 *
 * Two exclusions, both named directly by `type.name` rather than derived from `typeTextOf`'s own output,
 * because `typeTextOf` maps both to `unknown` too and this is precisely the distinction that matters here:
 *
 *   * **`dynamic`** — the source program itself declined to state a type. `value.foo()` on a `dynamic`
 *     receiver is what the author asked for, and refusing it would refuse ordinary, valid Dart this
 *     generator has always run (M9-J §6 of the milestone brief). `dynamic`'s own `TypeRef` carries no
 *     `library` at all (confirmed directly: a real `dynamic`-typed parameter's raw UIR is `{name:
 *     'dynamic'}`, no `library` key — the one structural fact that distinguishes it from every resolved
 *     `InterfaceType`, which always carries one), so `type?.['library'] === undefined` already excludes it
 *     without needing to name `'dynamic'` specially — but naming it here documents why, rather than relying
 *     on a coincidence of the analyzer's own output shape.
 *   * **`Object`/`Object?`** — Dart's own root type. Every value already satisfies it; refusing
 *     `.hashCode`/`.toString()`/`.runtimeType` on an `Object`-typed receiver would refuse code this
 *     generator already silently passed through before M9-J, and the milestone's own scope is a project-
 *     class-shaped gap, not a general audit of every `dart:core` root member (out of scope, milestone
 *     brief §1/§28-equivalent restraint).
 *
 * A receiver with no resolved `type` at all is left alone (returns `false`) — this function only ever
 * *adds* a refusal to a shape that would otherwise silently pass through; it never invents a new refusal
 * for a shape this milestone did not reproduce and prove.
 */
function isUnmodelledMemberReceiver(type: Node | undefined): boolean {
  if (type === undefined) return false;
  const rawName = type['name'];
  if (typeof rawName !== 'string') return false;
  const name = rawName.endsWith('?') ? rawName.slice(0, -1) : rawName;
  if (name === 'dynamic' || name === 'Object') return false;
  const text = typeTextOf(type);
  return text === 'unknown' || text === 'unknown | null';
}

/**
 * `dart:core Duration`'s own getters this generator lowers (M8-V), and how — arithmetic on the runtime
 * kit's own `Duration.inMilliseconds` (M7-L, the one field the kit's own `Duration` class exposes).
 * `Math.trunc` matches Dart's own truncating-toward-zero division exactly (`Duration` stores whole
 * microseconds internally and every getter divides, truncating — Dart's own SDK source states this).
 * Scoped to exactly the four getters real Continuum evidence uses (`formatUptime`,
 * `clipboard_staging.dart`, `clipboard_module.dart`) — not `inDays`/`inMicroseconds`/others, which no
 * real site needs and which this milestone does not claim to have proven.
 */
const DURATION_GETTERS: Readonly<Record<string, (millis: string) => string>> = {
  inMilliseconds: (millis) => millis,
  inSeconds: (millis) => `Math.trunc(${millis} / 1000)`,
  inMinutes: (millis) => `Math.trunc(${millis} / 60000)`,
  inHours: (millis) => `Math.trunc(${millis} / 3600000)`,
};

/**
 * Lowers a statement list. Assigned by `statement.ts` at import.
 *
 * A lambda may have a **statement** body — `validator: (value) { if (value == null) return 'required'; … }`
 * is ordinary Dart and the shape every form validator has — so the expression emitter needs the statement
 * emitter. But `statement.ts` already imports *this* module for its expressions, and a mutual import is a
 * cycle, which `.dependency-cruiser.cjs` rejects at error severity.
 *
 * So the dependency goes one way and the function is handed back, which is the same wiring the analyzer's
 * own extractor pair uses and for the same reason. It is a hook set once at module load, not per-request
 * state: nothing here is shipped to a server, and nothing about it varies between programs.
 */
let lowerStatements: ((body: unknown, scope: EmitScope) => string[]) | undefined;

/** Wires the statement emitter in. Called once, by `statement.ts`. */
export function setStatementLowering(lower: (body: unknown, scope: EmitScope) => string[]): void {
  lowerStatements = lower;
}

const kindOf = (node: Node): string => (typeof node['kind'] === 'string' ? node['kind'] : '<unknown>');
const idOf = (node: Node): string | undefined => (typeof node['id'] === 'string' ? node['id'] : undefined);

/**
 * The identifier every ordinary local variable [body] declares gets, by its own (declaration-tier,
 * ADR-28) id.
 *
 * A `logic.VarDecl` is never a top-level document node — it sits inside the statement body that
 * declares it — so `scope.node(id)` (the program's own top-level index) cannot resolve one; this walks
 * the body directly instead, the same shape `component.ts`'s own `referencedActions` already walks a
 * render tree with. `identifierOf` is a pure function of the declaration's own `name`, so two shadowed
 * locals with the same spelling correctly get the same emitted text — two `const x` in two nested JS
 * blocks shadow exactly the way the two Dart declarations did, and nothing here needs to invent a
 * disambiguating suffix for that to be correct (ADR-28 §12).
 */
export function localBindingsIn(body: unknown): Map<NodeId, string> {
  const found = new Map<NodeId, string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const node = value as Node;
    if (kindOf(node) === 'logic.VarDecl' && typeof node['id'] === 'string') {
      found.set(node['id'] as NodeId, identifierOf(String(node['name'] ?? '_')));
    }
    for (const child of Object.values(node)) visit(child);
  };
  visit(body);
  return found;
}

/**
 * Binary operators that mean the same thing in both languages.
 *
 * `Binary.operator` is deliberately a free-form `string` in the schema, and the reason is stated there: *"a
 * binary operator is pure — the worst a wrong one does is compute the wrong number. A wrong assignment
 * operator writes the wrong value to state."* That is an argument for not *validating* it in the schema; it is
 * not licence to pass it through unread. Anything not on this list is reported, not emitted.
 */
const SAFE_BINARY = new Set([
  '+', '-', '*', '<', '>', '<=', '>=', '&&', '||', '&', '|', '^', '<<', '>>',
]);

/** Dart's `==` is value equality for primitives and identity for objects — `===` is the honest lowering. */
const EQUALITY: Readonly<Record<string, string>> = { '==': '===', '!=': '!==' };

/** Wraps in parentheses. Applied structurally rather than by precedence analysis — see `emitExpression`. */
const paren = (text: string): string => `(${text})`;

/**
 * Emits a string literal.
 *
 * `JSON.stringify` handles the escaping, then the quotes are converted to the repo's single-quote
 * convention. Doing it by hand is how a generator eventually meets a string containing a backslash.
 */
export function stringLiteral(value: string): string {
  const json = JSON.stringify(value);
  const inner = json.slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'");
  return `'${inner}'`;
}

/** Emits a `logic.Lit`'s value. */
function literal(node: Node, scope: EmitScope): string {
  const value = node['value'];
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return stringLiteral(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    // Dart's `100.0` and JavaScript's `100` are the same number and print differently — the divergence
    // §A15/§A16 fixed for node identity. Here it is only cosmetic: the emitted `100` is the same value.
    return Object.is(value, -0) ? '-0' : String(value);
  }
  scope.report(
    GeneratorDiagnosticCode.UnsupportedExpression,
    'error',
    `a literal of type ${typeof value} has no lowering`,
    idOf(node),
  );
  return 'null';
}

/**
 * Lowers one expression to TypeScript.
 *
 * @param expr - the `logic.*` expression node.
 * @param scope - what is in scope, and where to report.
 * @returns the TypeScript text. Parenthesised where its own structure requires it.
 */
export function emitExpression(expr: Expr | Node | undefined, scope: EmitScope): string {
  if (expr === undefined || expr === null) return 'undefined';
  const node = expr as Node;

  switch (kindOf(node)) {
    case 'logic.Lit':
      return literal(node, scope);

    case 'logic.Ref': {
      const target = node['target'];
      if (typeof target === 'string') {
        const read = scope.signalRead(target);
        if (read !== undefined) return read;
        const local = scope.localName(target);
        if (local !== undefined) return local;

        // An application enum constant (M8-D) — `Stage.ready`, `target` resolved by the analyzer's own
        // element model to the declaring `logic.EnumDecl` (never by matching this string against
        // anything). No runtime kit or generated declaration models a Dart enum's *type* today — no
        // contract this milestone found says one should — so the value it carries is the one thing
        // already proven and already unique within it: the constant's own name, read from the tail of
        // this Ref's own `name` (not re-derived by search), lowered as a plain string literal. Dart's own
        // type system already refuses to compare two different enums' constants against each other, so
        // nothing downstream can conflate `Stage.ready` with an unrelated enum's own `ready`.
        const declaration = scope.node(target) as unknown as Node | undefined;
        if (declaration !== undefined && declaration['kind'] === 'logic.EnumDecl') {
          const dotted = typeof node['name'] === 'string' ? node['name'] : '';
          const member = dotted.split('.').at(-1) ?? '';
          // `Reason.values` (M8-Z) — Dart reserves `values` as a member name for every enum, so no real
          // enum constant is ever named this; the analyzer already only resolves a Ref to this branch
          // when the resolved element structurally *is* the compiler-synthesized `values` getter
          // (`_enumValuesTarget`, never by matching this string), so checking the name's tail here is
          // safe and unambiguous, not a second, weaker recognition of the same thing. `declaration.values`
          // is this same `EnumDecl`'s own already-ordered member list — the one place declaration order
          // is recorded — so the array is built from it directly, never re-derived or re-sorted.
          if (member === 'values') {
            const values = Array.isArray(declaration['values']) ? (declaration['values'] as unknown[]) : [];
            return `[${values.map((v) => stringLiteral(String(v))).join(', ')}]`;
          }
          return stringLiteral(member);
        }

        // A project-defined top-level function or getter (M8-J gave the reference its identity;
        // M8-K found the generator has no lowering for the declaration it now correctly targets). This
        // is deliberately a check on the **resolved node's kind**, never on `name` — a table keyed by
        // function name cannot generalise to an arbitrary project's own top-level functions the way
        // `MISSING_CAPABILITIES` can for a small, enumerable set of framework APIs.
        if (declaration !== undefined && declaration['kind'] === 'logic.FunctionDecl') {
          // ADR-29 (M8-U): a reachable, self-contained function this generator already committed to a
          // module resolves here — a same-file call needs no import at all (the two functions share one
          // `ModuleBuilder`, so the local name alone is already in scope); a cross-file call goes through
          // the same `module.use` every other cross-module reference already uses.
          const emitted = scope.functionModules.get(target);
          if (emitted !== undefined) {
            if (emitted.path === scope.module.path) return emitted.name;
            return scope.module.use(emitted.module, emitted.name);
          }

          // The declaration is real (a `logic.FunctionDecl` exists, with real params, a body, and a
          // return type); what does not exist is a supported lowering for *this* one — async, no body, or
          // a body that itself references something unsupported — so the honest diagnostic is a missing
          // capability, not an unresolved reference.
          const fnName = typeof declaration['name'] === 'string' ? declaration['name'] : String(node['name'] ?? '');
          scope.report(
            GeneratorDiagnosticCode.UnsupportedCapability,
            'error',
            `\`${fnName}\` is a project-defined top-level function, and this generator does not yet lower ` +
              `a \`logic.FunctionDecl\` to a module-level TypeScript function. That work belongs to ` +
              `${OWNER_LABEL['generator']}.`,
            idOf(node),
          );
          return REFUSED;
        }

        // A project-defined top-level `const`/`final` variable (M8-J gave the reference its identity;
        // M8-P measured whether the declaration itself could be lowered and found no real Continuum site
        // that would benefit — both of the two motivating cases fail for reasons a `FieldDecl` fix would
        // not touch: one's initializer constructs a third-party class `logic.New` already refuses on its
        // own terms, and the other's only real reference is a route-boundary argument N11 classifies
        // before this code ever runs. The identity is sound and the declaration is real; only the
        // lowering is missing, so — mirroring `logic.FunctionDecl` immediately above, the identical
        // structural check on the resolved target's own kind, never on `name` — the honest diagnostic is
        // a missing capability, not an unresolved reference.
        if (declaration !== undefined && declaration['kind'] === 'logic.FieldDecl') {
          const fieldName = typeof declaration['name'] === 'string' ? declaration['name'] : String(node['name'] ?? '');
          scope.report(
            GeneratorDiagnosticCode.UnsupportedCapability,
            'error',
            `\`${fieldName}\` is a project-defined top-level variable, and this generator does not yet ` +
              `lower a \`logic.FieldDecl\` to a module-level TypeScript declaration. That work belongs to ` +
              `${OWNER_LABEL['generator']}.`,
            idOf(node),
          );
          return REFUSED;
        }
      }
      const name = node['name'];

      // A parameter. Declared on the enclosing `sig.Action` (§A18) or `ui.Component`, carrying no id because
      // a `ParamDecl` is a value rather than a node — so this is the only way it can resolve, and it is the
      // way the model intends. Before §A18 this branch could not exist: `toggle(int id)`'s `id` reached here
      // with nothing to match against, and became BRG3006.
      if (typeof name === 'string') {
        const param = scope.paramInScope(name);
        if (param !== undefined) return param;
      }

      // A **static const of a kit value type** — `Alignment.bottomRight`, `AlignmentDirectional.topStart`.
      // Dart writes these as `Type.member` on a class the kit mirrors, and the kit mirrors them as static
      // members for exactly this reason, so the lowering is the same text with an import attached.
      //
      // Guarded on both halves: the resolved type must be one the kit provides (its library is
      // `package:flutter/…`, the same test `logic.New` uses), *and* the dotted name's prefix must be that
      // type's own name. Without the second check a `Ref` of any Flutter-typed expression would be rewritten
      // into a member access that does not exist; with it, the only thing that matches is the shape this
      // branch is for. A kit type that does not export the member is caught by `tsc` in the build proof
      // (`TS2339`), which is what that test is for.
      if (typeof name === 'string' && isKitProvided(node['type'] as Node | undefined)) {
        const typeName = String((node['type'] as Node | undefined)?.['name'] ?? '');
        const [prefix, ...rest] = name.split('.');
        if (typeName !== '' && prefix === typeName && rest.length === 1) {
          return `${scope.module.use(RUNTIME, typeName)}.${identifierOf(rest[0]!)}`;
        }

        // The same shape, where Flutter's **holder** class is not its value type. `Curves.easeInOut` has
        // type `Curve`, not `Curves`; `Colors.white` has type `Color`. The check above requires the dotted
        // prefix to *be* the type's name, so it matches neither — and M4-H's build proof is the first
        // fixture to reach one, because M4-E hoists every `Colors.*` into a token before it gets here.
        //
        // Widened to: the resolved type is kit-provided, the name is `Holder.member`, and the holder is
        // pluralisation-adjacent to the type. Requiring a relationship at all is what keeps this from
        // rewriting every Flutter-typed reference into a member access that does not exist; a holder the
        // kit does not export is caught by `tsc` in the build proof, which is what that test is for.
        if (rest.length === 1 && prefix !== undefined && typeName !== '' && isHolderOf(prefix, typeName)) {
          return `${scope.module.use(RUNTIME, prefix)}.${identifierOf(rest[0]!)}`;
        }
      }

      // Otherwise the `Ref` names something outside the program — `notifyListeners()`, a top-level Dart
      // function, a package API. Emitting the bare name produces a file that does not compile, and picking a
      // plausible replacement is inventing. `notifyListeners` is the instructive case: under ADR-4 a signal
      // write *is* the notification, so the call is redundant — but "redundant" is a judgement about
      // ChangeNotifier's semantics, which belongs to whatever models them, not to a name lookup here.
      // A name the generator *knows* it cannot lower gets the capability diagnostic, not the generic one.
      // `Navigator.pushNamed` is the case that forced this: reporting "not declared in this program" blamed
      // the program for a gap the compiler owns — the analyzer had already emitted the `app.RouteTransition`
      // for that very call, and the kit's router was waiting for it.
      const missing = typeof name === 'string' ? missingCapabilityOf(name, undefined) : undefined;
      if (missing !== undefined) {
        scope.report(
          GeneratorDiagnosticCode.UnsupportedCapability,
          'error',
          `\`${name}\` needs ${missing.capability}, which is not built yet. That work belongs to ` +
            `${OWNER_LABEL[missing.owner]}.` +
            (missing.workaround === undefined ? '' : ` For now: ${missing.workaround}.`),
          idOf(node),
        );
        return REFUSED;
      }

      scope.report(
        GeneratorDiagnosticCode.UnresolvedReference,
        'error',
        typeof name === 'string'
          ? `\`${name}\` is not declared in this program, so there is nothing to emit for it. It needs an ` +
            `override, or a pass that models what it means.`
          : 'a reference names neither a declaration in the program nor a name',
        idOf(node),
      );
      return REFUSED;
    }

    case 'logic.Binary': {
      const operator = String(node['operator'] ?? '');
      const left = emitExpression(node['left'] as Node, scope);
      const right = emitExpression(node['right'] as Node, scope);

      if (operator in EQUALITY) return paren(`${left} ${EQUALITY[operator]} ${right}`);
      if (SAFE_BINARY.has(operator)) return paren(`${left} ${operator} ${right}`);

      // The two that do not survive translation. Both are silent: they compute a number, and the number is
      // wrong only for some inputs.
      if (operator === '%') {
        // Dart: `-7 % 3 == 2`. JavaScript: `-7 % 3 === -1`. Dart's result carries the divisor's sign.
        return paren(`(((${left}) % (${right})) + (${right})) % (${right})`);
      }
      if (operator === '~/') {
        // Dart's truncating division. `7 ~/ 2 == 3`, and `-7 ~/ 2 == -3` — toward zero, not toward -Infinity,
        // so `Math.floor` is wrong for negatives.
        return `Math.trunc(${left} / ${right})`;
      }
      if (operator === '/') {
        // Dart's `/` on two ints is double division — `7 / 2 == 3.5` — which is what JavaScript does anyway.
        return paren(`${left} / ${right}`);
      }
      if (operator === '??') return paren(`${left} ?? ${right}`);

      scope.report(
        GeneratorDiagnosticCode.UnsupportedExpression,
        'error',
        `the binary operator \`${operator}\` has no lowering to TypeScript that is known to preserve its ` +
          `Dart meaning. Emitting it unchanged would compute a value the author did not write.`,
        idOf(node),
      );
      return 'undefined';
    }

    case 'logic.Unary': {
      const operator = String(node['operator'] ?? '');
      const operand = emitExpression(node['operand'] as Node, scope);
      if (operator === '!' || operator === '-' || operator === '~') return paren(`${operator}${operand}`);
      scope.report(
        GeneratorDiagnosticCode.UnsupportedExpression,
        'error',
        `the unary operator \`${operator}\` has no known lowering`,
        idOf(node),
      );
      return 'undefined';
    }

    case 'logic.Conditional':
      return paren(
        `${emitExpression(node['test'] as Node, scope)} ? ` +
          `${emitExpression(node['then'] as Node, scope)} : ` +
          `${emitExpression(node['otherwise'] as Node, scope)}`,
      );

    case 'logic.NullCheck': {
      // Two Dart forms in one node, told apart by `fallback`: `a ?? b` has one, `a!` does not. `!` asserts
      // non-null in both languages and erases in both; `??` is identical in both.
      const operand = emitExpression(node['operand'] as Node, scope);
      if (node['fallback'] === undefined) return `${operand}!`;
      return paren(`${operand} ?? ${emitExpression(node['fallback'] as Node, scope)}`);
    }

    case 'logic.Intrinsic': {
      // `mounted` / `context.mounted` (ADR-0026) — both lower to this component's own `useMounted()`
      // ref. There is no other "which component" a flat React tree could ask about, which is why the
      // schema keeps the two facts distinct (a future target may answer them differently) while this
      // target answers them the same way.
      const local = scope.mountedLocal;
      if (local === undefined) {
        // The component emitter declares this whenever the tree reads an intrinsic, the same way
        // `routerLocal` is declared whenever it navigates. Unreachable from a whole component; reachable
        // only if a `logic.Intrinsic` is lowered from somewhere that has none.
        scope.report(
          GeneratorDiagnosticCode.UnresolvedReference,
          'error',
          'a mounted/context.mounted read is lowered outside a component, so there is no lifecycle ref ' +
            'in scope for it. It is declared per component; this read reached the generator from ' +
            'somewhere that has none.',
          idOf(node),
        );
        return 'undefined';
      }
      // `operand` (the context value, for `contextMounted`) is never evaluated. It carries no
      // information this lowering needs — both members read the same ref — and unlike a dropped
      // constructor argument, evaluating it anyway would not protect against a silent omission; it would
      // only risk refusing an otherwise-ordinary read that happens to be unresolvable on its own, such as
      // a bare `context` parameter (never bound in `Scope` — Spec v2.5 §A18.3 resolves a parameter by
      // name, and the build method's own `context` is not a declared parameter of anything the generator
      // tracks). A refusal here would be about a value this output never uses.
      return `${local}.current`;
    }

    case 'logic.PropertyAccess': {
      // A locally-owned store instance's signal/derived member (ADR-27) — `favorites.favoriteCount`.
      // Resolved by the node's own id, never by `target` alone: `target` names the *member* (shared by
      // every instance of the store), and the id is what distinguishes `left.count` from `right.count`.
      // `storeAccessRead` returns undefined for an ordinary property access, or one whose `target` names
      // an action (a tear-off is called, not read, and needs no subscription) — in which case this falls
      // through to the same `receiver.property` lowering it always had.
      const id = idOf(node);
      if (id !== undefined) {
        const resolved = scope.storeAccessRead(id);
        if (resolved !== undefined) return resolved;
      }

      // A `dart:core Duration`'s own getter (M8-V) — checked by the *receiver's* own resolved type,
      // never by the property's bare name, so an unrelated `.inSeconds` on some other value (or a
      // project-defined lookalike) is untouched and falls through to the ordinary lowering below.
      const receiverNode = node['receiver'] as Node | undefined;
      if (sdkTypeOf(receiverNode?.['type'] as Node | undefined) === 'Duration') {
        const property = String(node['property'] ?? '');
        const getter = DURATION_GETTERS[property];
        const receiver = emitExpression(receiverNode, scope);
        if (receiver === REFUSED) return REFUSED;
        if (getter !== undefined) return getter(`${receiver}.inMilliseconds`);
        scope.report(
          GeneratorDiagnosticCode.UnsupportedExpression,
          'error',
          `\`Duration.${property}\` has no lowering. This generator supports ` +
            `\`inMilliseconds\`/\`inSeconds\`/\`inMinutes\`/\`inHours\` (M8-V) — the getters real evidence has ` +
            `needed so far. A different one needs its own evidence before it can be added.`,
          idOf(node),
        );
        return REFUSED;
      }

      // M9-J: a property read with no resolved `target` (so not a recognized store member, per the check
      // above), off a receiver that is itself a bare parameter read (`isParameterReceiver` — the only
      // shape whose emitted type is actually `typeTextOf`'s own `unknown`, never a local's tsc-inferred
      // one), whose type has no TypeScript representation, is a project-defined or external-package class
      // this generator has no member model for. Checked before `receiver` is emitted here — mirroring the
      // `ScaffoldMessenger`-family check below — so a chained `model.child.name` refuses once, at the
      // first unsupported edge (`model.child`, itself a parameter read), rather than once per level.
      const receiverTypeForMember = receiverNode?.['type'] as Node | undefined;
      if (
        node['target'] === undefined &&
        isParameterReceiver(receiverNode, scope) &&
        isUnmodelledMemberReceiver(receiverTypeForMember)
      ) {
        const property = String(node['property'] ?? '');
        const receiverTypeName = String(receiverTypeForMember?.['name'] ?? 'this value');
        scope.report(
          GeneratorDiagnosticCode.UnsupportedCapability,
          'error',
          `\`${property}\` reads a member of \`${receiverTypeName}\`, a class this generator has no member ` +
            `model for. FlutterBridge does not yet lower a project-defined or external-package class's own ` +
            `fields, getters or methods — this refuses reading a member of \`${receiverTypeName}\`, not ` +
            `carrying a \`${receiverTypeName}\` value, which is unaffected. Owner: ${OWNER_LABEL['generator']}.`,
          idOf(node),
        );
        return REFUSED;
      }

      const receiver = emitExpression(node['receiver'] as Node, scope);
      return `${receiver}.${identifierOf(String(node['property'] ?? ''))}`;
    }

    case 'logic.MethodCall': {
      // A `ScaffoldMessenger`-family call (ADR-0030) — checked, and lowered, *before* the receiver is
      // emitted: there is no runtime component for `.of(context)` itself (the messenger collapses into
      // "the one root host"), so emitting the receiver here would spuriously refuse it
      // (`missingCapabilityOf('ScaffoldMessenger.of', ...)`) even on a call this generator does support.
      if (isScaffoldMessengerCall(node)) {
        return lowerScaffoldMessengerCall(node, scope);
      }

      const receiver = emitExpression(node['receiver'] as Node, scope);
      refuseNamedArgs(node, scope);
      const method = String(node['method'] ?? '');

      // Dart's subscript. `a[b]` **is** `a.operator[](b)` — the language says so, the analyzer resolves it
      // to that operator, and M4-H models it as the method call it is rather than as an opaque expression.
      // JavaScript spells the same operator the same way, so the lowering is the subscript back again.
      //
      // Without this the generic branch below emitted `a.__(b)`: `identifierOf('[]')` sanitises the brackets
      // into underscores, producing a method call on a name nothing declares. That is what the build proof
      // caught the first time a real `items[index]` reached the generator.
      if (method === '[]') {
        const args = asArray(node['args']);
        if (args.length === 1) {
          return `${receiver}[${emitExpression(args[0] as Node, scope)}]`;
        }
      }

      // A `dart:core int`/`double`/`num` numeric method (M8-V) — checked by the *receiver's* own
      // resolved type, never by the method's bare name, so a project-defined class's own same-named
      // method (`FakeNumber.toDouble()`) is untouched and falls through to the ordinary lowering below.
      const receiverType = sdkTypeOf((node['receiver'] as Node | undefined)?.['type'] as Node | undefined);
      if (receiverType === 'int' || receiverType === 'double' || receiverType === 'num') {
        const rawArgs = asArray(node['args']);

        // `int.toDouble()`/`num.toDouble()` — a semantic no-op. JavaScript's `number` already IS the
        // IEEE-754 double Dart's own `double` is; the value does not change representation crossing this
        // call, for the same JS-safe-integer domain this project already restricts every Dart `int` to
        // (D2/ADR-5 — an int beyond 2^53 is refused at the canonical-encoding layer, before this is ever
        // reached). No cast, no wrapper: the receiver's own already-emitted text is the whole answer.
        if (method === 'toDouble' && rawArgs.length === 0) return receiver;

        // `int.remainder(other)`/`num.remainder(other)` — Dart's own truncating remainder (same sign as
        // the dividend: `this == (this ~/ other) * other + this.remainder(other)`), which is exactly
        // JavaScript's own `%` — *not* Dart's own `%` operator, which `logic.Assign`'s own doc already
        // warns is different from JavaScript's (`-7 % 3` is `2` in Dart, `-1` in JS). `.remainder()` and
        // `%` are two different Dart operations; only `.remainder()` matches JS's `%`, and that identity
        // is what is used here, not an approximation of the other one.
        if (method === 'remainder' && rawArgs.length === 1) {
          const arg = emitExpression(rawArgs[0] as Node, scope);
          if (arg === REFUSED) return REFUSED;
          return `(${receiver} % ${arg})`;
        }

        // `double.toStringAsFixed(n)`/`num.toStringAsFixed(n)` → `.toFixed(n)`. Both Dart's `double` and
        // JavaScript's `number` are IEEE-754 binary64 — the same bits, not merely similar ones — so for
        // a finite, non-NaN value the two formatters diverge only at the same binary-representation
        // rounding boundaries either language already has (documented, not silently assumed — M8-V's own
        // milestone doc §14 records the comparison this claim rests on). `NaN`/`Infinity` are not
        // specially handled: both languages already format them as `"NaN"`/`"Infinity"`, the identical
        // text, so no extra branch is needed to keep that case honest.
        if (method === 'toStringAsFixed' && rawArgs.length === 1) {
          const arg = emitExpression(rawArgs[0] as Node, scope);
          if (arg === REFUSED) return REFUSED;
          return `${receiver}.toFixed(${arg})`;
        }

        scope.report(
          GeneratorDiagnosticCode.UnsupportedExpression,
          'error',
          `\`${receiverType}.${method}\` has no lowering. This generator supports \`toDouble\`, ` +
            `\`toStringAsFixed\`, and \`remainder\` on a \`dart:core\` numeric value (M8-V) — the methods ` +
            `real evidence has needed so far. A different one needs its own evidence before it can be added.`,
          idOf(node),
        );
        return REFUSED;
      }

      // M9-J: the same unmodelled-receiver refusal `logic.PropertyAccess` reports (see its own comment),
      // for a method call rather than a property read. Guarded on `receiver !== REFUSED`: the receiver was
      // already emitted above (line-eager in this case, unlike `PropertyAccess`'s own deferred evaluation),
      // so a receiver that is itself an unmodelled member access — `model.child.compute()`, where `.child`
      // already refused — already reported its own, more specific diagnostic; this avoids a second, less
      // specific one cascading on top of it (milestone brief §16).
      const methodReceiverNode = node['receiver'] as Node | undefined;
      const methodReceiverType = methodReceiverNode?.['type'] as Node | undefined;
      if (
        receiver !== REFUSED &&
        node['target'] === undefined &&
        isParameterReceiver(methodReceiverNode, scope) &&
        isUnmodelledMemberReceiver(methodReceiverType)
      ) {
        const methodReceiverTypeName = String(methodReceiverType?.['name'] ?? 'this value');
        scope.report(
          GeneratorDiagnosticCode.UnsupportedCapability,
          'error',
          `\`${method}\` calls a member of \`${methodReceiverTypeName}\`, a class this generator has no ` +
            `member model for. FlutterBridge does not yet lower a project-defined or external-package ` +
            `class's own fields, getters or methods — this refuses calling a member of ` +
            `\`${methodReceiverTypeName}\`, not carrying a \`${methodReceiverTypeName}\` value, which is ` +
            `unaffected. Owner: ${OWNER_LABEL['generator']}.`,
          idOf(node),
        );
        return REFUSED;
      }

      const args = emitArguments(node['args'], scope);
      return `${receiver}.${identifierOf(method)}(${args})`;
    }

    case 'logic.Call': {
      // `ScaffoldMessenger.of(context)` (ADR-0030) — checked, and lowered, *before* the callee is
      // emitted, for the identical reason `logic.MethodCall`'s own check runs first: there is no kit
      // export for `ScaffoldMessengerState`, so emitting the callee would spuriously refuse a call this
      // generator does support (`final m = ScaffoldMessenger.of(context); m.showSnackBar(...)`, one
      // level of local-variable indirection, ADR-0030 §6/G13). Recognized by the call's own *resolved
      // return type* alone — `ScaffoldMessengerState` has no public constructor and no other factory in
      // real Flutter, so any expression of this type is this call, whatever its own callee's shape.
      if (isFlutterType(node['type'] as Node | undefined, 'ScaffoldMessengerState')) {
        const snackbarHost = scope.snackbarHostLocal;
        if (snackbarHost !== undefined) return snackbarHost;
        // Defensive only, mirroring `lowerScaffoldMessengerCall`'s own fallback: `declareSnackbarHost`
        // hoists this hook whenever *any* recognized call is reachable, and this expression only ever
        // reaches generated output alongside at least one (this milestone does not support acquiring a
        // messenger and never calling anything on it).
        scope.report(
          GeneratorDiagnosticCode.UnsupportedCapability,
          'error',
          'this needs the snack bar host, which this component did not hoist. That is a defect in the ' +
            'generator, not in the program.',
          idOf(node),
        );
        return REFUSED;
      }

      const target = node['callee'];
      const callee = emitExpression(target as Node, scope);
      // A refused callee stops the call. Emitting the arguments anyway produced one diagnostic per argument
      // for a call that was already refused — `Navigator.pushNamed(context, '/details')` reported three, two
      // of them naming `context`, a framework primitive nobody can act on. One refusal, at the callee, is the
      // whole fact; the rest was noise that buried it.
      //
      // Guarded on the callee *existing*, because {@link REFUSED} is also what an absent expression emits. A
      // call with no callee is a malformed document rather than a refusal, and it must keep falling through
      // to a `tsc` failure instead of vanishing with no diagnostic at all.
      if (target !== undefined && target !== null && callee === REFUSED) return REFUSED;

      // The named-argument refusal belongs **after** the callee, for the reason stated directly above: it is
      // part of "the rest", and it was the one piece still escaping the rule. M6-E measured what that cost:
      // `showDialog(context: …, builder: …)` reported `BRG3013` naming the missing capability *and* a
      // `BRG3002` saying the call "passes Dart named arguments", as though naming them differently might
      // help. The second reads as a defect in valid Flutter code and points at work no author can do.
      //
      // A call the generator *can* lower still gets `BRG3002`, which is the case that diagnostic is for.
      refuseNamedArgs(node, scope);
      return `${callee}(${emitArguments(node['args'], scope)})`;
    }

    case 'logic.New': {
      const typeName = String(node['typeName'] ?? '');

      // A `GlobalKey` is a handle on a live widget's `State`. UIR carries values, signals, routes and
      // components; it has nothing that denotes "the mounted element over there", so a key cannot be lowered
      // to anything that would work. Refused at its construction — the root of the whole pattern — rather
      // than at the `currentState!.validate()` call, so the diagnostic names the cause instead of a symptom.
      if (typeName === 'GlobalKey' || typeName.startsWith('GlobalKey<')) {
        scope.report(
          GeneratorDiagnosticCode.UnsupportedGlobalKey,
          'error',
          'a `GlobalKey` is a handle on a live widget\'s State, and UIR has no construct that denotes one — ' +
            'it is not a value, a signal, a route or a component. That gap belongs to the schema. A `Form` ' +
            'in this kit validates every registered field when it is submitted, which needs no key; ' +
            '`_formKey.currentState!.validate()` has no equivalent and is not emitted, because a button ' +
            'that compiles and does nothing is worse than one that is refused.',
          idOf(node),
        );
        return 'undefined';
      }

      // `Future.delayed(Duration(...))` — M7-L. Not a `Future` compatibility class: JavaScript already has
      // the value this needs, `Promise<void>`, and `logic.Await` already lowers to plain `await`. `delay`
      // is the one function the kit needed to add. Recognized by the resolved type (`dart:async`'s
      // `Future`) and constructor name, never by matching the source text `Future.delayed`.
      const constructedType = node['type'] as Node | undefined;
      if (typeName === 'Future' && constructedType?.['library'] === 'dart:async' && node['constructorName'] === 'delayed') {
        const delayedArgs = asArray(node['args']);
        // The two-argument overload — `Future.delayed(duration, computation)` — runs `computation` after
        // the delay and resolves to *its* result. `delay` is `Promise<void>`: there is nothing in it to
        // resolve a callback's result into, so a computation is refused by name rather than silently
        // dropped — the single-argument shape is asserted by length, not by ignoring a second argument.
        if (delayedArgs.length !== 1) {
          scope.report(
            GeneratorDiagnosticCode.UnsupportedExpression,
            'error',
            '`Future.delayed` with a computation callback resolves to whatever that callback returns, ' +
              "once the delay elapses. This kit's `delay` is `Promise<void>` — nothing to resolve a " +
              'callback\'s result into. Missing capability: an asynchronous computation, not just a wait. ' +
              'Owner: the runtime kit.',
            idOf(node),
          );
          return REFUSED;
        }
        const durationArg = emitExpression(delayedArgs[0] as Node, scope);
        if (durationArg === REFUSED) return REFUSED;
        return `${scope.module.use(RUNTIME, 'delay')}(${durationArg})`;
      }

      const constructorName = node['constructorName'];
      const kitProvided = isKitProvided(node['type'] as Node | undefined);

      // Dart's named arguments have no positional equivalent in TypeScript, and lowering them needs the
      // callee's signature — which the program does not carry for an arbitrary user class, so `refuseNamedArgs`
      // refuses rather than guessing which parameter a value belongs to.
      //
      // For a **kit-provided** type the signature *is* known, because the kit authors it to a fixed
      // convention: Dart's named parameters become one options object, positional stay positional. That is
      // how `EdgeInsets.symmetric({ vertical: 8 })` and `new BoxConstraints({ maxWidth: 400 })` are already
      // written, and applying the convention here is what makes them reachable — before M4-B, every named-arg
      // construction of a framework value type was a hard `BRG3002`, including `EdgeInsets.symmetric`, whose
      // kit signature had been waiting for it since M3-A.
      if (!kitProvided) refuseNamedArgs(node, scope);

      const positional = emitArguments(node['args'], scope);
      const named = node['namedArgs'];
      const options =
        kitProvided && typeof named === 'object' && named !== null && Object.keys(named).length > 0
          ? // Sorted, so the emitted bytes do not depend on the order the analyzer happened to walk the
            // argument list — the same rule the element emitter applies to props.
            `{ ${Object.keys(named as Record<string, Node>)
              .sort()
              .map((key) => `${identifierOf(key)}: ${emitExpression((named as Record<string, Node>)[key]!, scope)}`)
              .join(', ')} }`
          : undefined;
      const args = [positional, options].filter((part) => part !== undefined && part !== '').join(', ');

      // ## A construction of the application's own class has nothing to construct
      //
      // M3-B does not emit `logic.ClassDecl` — `types.ts` records that, which is why a user type in a
      // parameter position lowers to `unknown` rather than to an invented interface. The *value* side had no
      // such check: `const Wonder('Petra', …)` emitted `new Wonder('Petra', …)` referring to a class the
      // generator had not written, and nothing said so. It compiled through every stage and failed at `tsc`
      // with `TS2552: Cannot find name 'Wonder'`, which is the emitted project's problem to explain rather
      // than the compiler's — precisely the "compiles around the hole" outcome the severity rule forbids.
      //
      // Refused here, with the class named. Not for a *framework* type: those are the kit's, and the kit
      // exports them.
      if (!kitProvided && !scope.declaresClass(typeName)) {
        scope.report(
          GeneratorDiagnosticCode.UnsupportedExpression,
          'error',
          `\`${typeName}\` is one of this application's own classes, and this generator does not emit ` +
            `class declarations — so \`new ${typeName}(…)\` would name a type the project does not ` +
            `contain. Missing capability: lowering a \`logic.ClassDecl\` to a TypeScript class. Owner: ` +
            `this generator.`,
          idOf(node),
        );
        return REFUSED;
      }

      // A kit-provided type must be imported, or the reference dangles at `tsc` (D2). The import is registered
      // here, automatically, from the type's own library; `module.use` returns the local name and folds a
      // repeat into one import. A user type is written as-is, with no kit import invented.
      const name = kitProvided ? scope.module.use(RUNTIME, typeName) : identifierOf(typeName);
      // A named constructor — `EdgeInsets.all(16)` — is a static method in TypeScript, which is the shape the
      // kit's own `EdgeInsets` has, so it lowers without a `new`.
      if (typeof constructorName === 'string' && constructorName !== '') {
        return `${name}.${identifierOf(constructorName)}(${args})`;
      }
      return `new ${name}(${args})`;
    }

    case 'logic.ListLit': {
      const elements = asArray(node['elements']).map((e) => emitExpression(e, scope));
      return `[${elements.join(', ')}]`;
    }

    case 'logic.MapLit': {
      // Dart's `{}` is a Map *or* a Set — `<int>{}` is a Set — and UIR has no `SetLit`, so both arrive as
      // `logic.MapLit` and the resolved type is what tells them apart. Emitting `new Map()` for a Set gives
      // it `.add`, `.has` and `.delete` that all mean something else, and the mistake compiles.
      const typeName = String((node['type'] as Node | undefined)?.['name'] ?? '');
      const keys = asArray(node['keys']).map((key) => emitExpression(key, scope));
      if (typeName.startsWith('Set<') || typeName === 'Set') {
        return `new Set([${keys.join(', ')}])`;
      }
      const values = asArray(node['values']).map((value) => emitExpression(value, scope));
      // A Dart `Map` is not a JS object literal: its keys are not coerced to strings. `new Map` preserves that.
      const entries = keys.map((key, index) => `[${key}, ${values[index] ?? 'undefined'}]`);
      return `new Map([${entries.join(', ')}])`;
    }

    case 'logic.StringInterp': {
      const parts = asArray(node['parts']).map((part) => {
        const item = part as Node;
        if (kindOf(item) === 'logic.Lit' && typeof item['value'] === 'string') {
          return (item['value'] as string).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
        }
        return `\${${emitExpression(item, scope)}}`;
      });
      return `\`${parts.join('')}\``;
    }

    case 'logic.Lambda': {
      const declared = asArray(node['params']).map((p) => String((p as Node)['name'] ?? '_'));
      const params = declared.map((name) => identifierOf(name)).join(', ');

      // A lambda's parameters are in scope *inside* it, and were not before M4-F: `validator: (value) { … }`
      // lowered a body in which `value` resolved to nothing and became `BRG3006`. It had never come up
      // because no earlier fixture put a lambda with a *body* in the widget tree — a store's action carries
      // its parameters on the `sig.Action`, which `childScope` already handled.
      //
      // Resolution is by name and innermost-first, which is ordinary lexical scoping: a parameter shadows an
      // outer name of the same spelling, exactly as it does in Dart.
      const names = new Set(declared);
      // A local this lambda itself declares (ADR-28) — reached here rather than through N5's lift path
      // because this lambda was never lifted (it writes no signal state, e.g. a form validator), so its
      // body is lowered inline instead of becoming a standalone `sig.Action`.
      const locals = localBindingsIn(node['body']);
      const inner: EmitScope = {
        ...scope,
        report: scope.report.bind(scope),
        node: scope.node.bind(scope),
        signalRead: scope.signalRead.bind(scope),
        signalLocal: scope.signalLocal.bind(scope),
        localName: (id) => locals.get(id) ?? scope.localName(id),
        declaredName: scope.declaredName.bind(scope),
        paramInScope: (name) => (names.has(name) ? identifierOf(name) : scope.paramInScope(name)),
      };

      const body = node['body'];

      // A **statement** body — `(value) { if (value == null) return 'required'; return null; }`, which is
      // what every form validator is. It lowers to a block-bodied arrow, which is the same shape in both
      // languages. Before M4-F this warned and then handed the statement *array* to the expression emitter,
      // which reported it as `<unknown>`: a warning followed by an error, and no working output.
      if (Array.isArray(body)) {
        if (lowerStatements === undefined) {
          scope.report(
            GeneratorDiagnosticCode.UnsupportedExpression,
            'error',
            'a lambda with a statement body reached the expression emitter before the statement emitter ' +
              'was wired in. That is a build defect in this package, not a defect in the program.',
            idOf(node),
          );
          return 'undefined';
        }
        const lines = lowerStatements(body, inner);
        return `(${params}) => {\n${lines.map((line) => `  ${line}`).join('\n')}\n}`;
      }

      return `(${params}) => ${emitExpression(node['body'] as Node, inner)}`;
    }

    case 'logic.Await':
      return `await ${emitExpression(node['operand'] as Node, scope)}`;

    case 'logic.Cast':
      // Dart's `as` is a *checked* downcast that throws; TypeScript's is erased. Emitting `as` would silently
      // turn a runtime guarantee into a compile-time assertion, so the value passes through unchanged and the
      // type is left to inference — which is honest about what the output actually checks.
      return emitExpression(node['operand'] as Node, scope);

    case 'logic.Assign':
      return emitAssignment(node, scope);

    case 'logic.OpaqueExpr': {
      const source = typeof node['source'] === 'string' ? node['source'] : '<unknown>';
      scope.report(
        GeneratorDiagnosticCode.OpaqueConstruct,
        'error',
        `\`${source}\` has no UIR representation, so it reached the generator as opaque source (INV-4). ` +
          `It cannot be lowered without guessing what it means; it needs an override.`,
        idOf(node),
      );
      return 'undefined';
    }

    default:
      scope.report(
        GeneratorDiagnosticCode.UnsupportedExpression,
        'error',
        `\`${kindOf(node)}\` has no lowering in this generator`,
        idOf(node),
      );
      return 'undefined';
  }
}

/**
 * The non-subscribing (`.get()`) read for a `logic.PropertyAccess` naming a store instance's signal/
 * derived member (ADR-27) — the default `EmitScope.storeAccessRead`, used everywhere a component's own
 * render-position subscription (`declareStoreInstanceReads`, `component.ts`) does not override it: inside
 * an action body, exactly the "handler reads `.get()`, never a stale subscribed local" rule `actionScope`
 * already applies to a component's own signals.
 *
 * Computed on demand rather than hoisted: `.get()` is a plain method call, not a hook, so it carries none
 * of the Rules-of-Hooks constraints a `useSignal(...)` call would.
 *
 * @param id - a `logic.PropertyAccess` node's own id.
 * @param scope - resolution, to look the node and its target's kind back up.
 * @returns the resolved read, or `undefined` if `id` does not name this shape.
 */
export function defaultStoreAccessRead(id: NodeId, scope: EmitScope): string | undefined {
  const node = scope.node(id) as unknown as Node | undefined;
  if (node === undefined || node['kind'] !== 'logic.PropertyAccess') return undefined;
  const target = node['target'];
  if (typeof target !== 'string') return undefined;
  const info = scope.storeMembers.get(target);
  if (info === undefined || info.kind === 'action') return undefined;
  const receiver = emitExpression(node['receiver'] as Node, scope);
  return `${receiver}.${identifierOf(String(node['property'] ?? ''))}.get()`;
}

/** Emits a call's positional arguments. */
function emitArguments(value: unknown, scope: EmitScope): string {
  return asArray(value)
    .map((argument) => emitExpression(argument, scope))
    .join(', ');
}

/**
 * Refuses a call that passes Dart named arguments.
 *
 * `foo(bar: 1)` has no positional equivalent: JavaScript would need an options object, and which parameter
 * that object corresponds to is a fact about the callee's signature, which the generator does not have. A
 * guess here silently passes an argument to the wrong parameter.
 */
function refuseNamedArgs(node: Node, scope: EmitScope): void {
  const named = node['namedArgs'];
  if (named === undefined || (typeof named === 'object' && named !== null && Object.keys(named).length === 0)) {
    return;
  }
  scope.report(
    GeneratorDiagnosticCode.UnsupportedExpression,
    'error',
    `this call passes Dart named arguments (${Object.keys(named as object).join(', ')}). Lowering them ` +
      `needs the callee's signature, which the program does not carry, and guessing would pass a value to ` +
      `the wrong parameter.`,
    idOf(node),
  );
}

function asArray(value: unknown): Node[] {
  return Array.isArray(value) ? (value as Node[]) : [];
}

// ── ADR-0030: ScaffoldMessenger / SnackBar presentation ─────────────────────────────────────────────

/** The four `ScaffoldMessengerState` methods this decision recognizes (ADR-0030 §8). */
const SCAFFOLD_MESSENGER_METHODS: ReadonlySet<string> = new Set([
  'showSnackBar',
  'hideCurrentSnackBar',
  'removeCurrentSnackBar',
  'clearSnackBars',
]);

/** `SnackBar`'s own supported named arguments (ADR-0030 §8) — anything else is refused, not dropped (§12). */
const SNACKBAR_ALLOWED_ARGS: ReadonlySet<string> = new Set(['content', 'action', 'duration']);

/** `SnackBarAction`'s own supported named arguments (ADR-0030 §11) — anything else is refused, not dropped. */
const SNACKBAR_ACTION_ALLOWED_ARGS: ReadonlySet<string> = new Set(['label', 'onPressed']);

/**
 * Whether a resolved type is Flutter's real `name` — the type's own **library**, not a hand-kept full
 * path, the identical check `isKitProvided` already uses (`runtime.ts`). Real Flutter SDK evidence (this
 * milestone's own build-proof fixture) is what this exists for: `ScaffoldMessengerState`/`SnackBar`
 * resolve to `package:flutter/src/material/scaffold.dart`/`.../snack_bar.dart`, not the more guessable
 * `package:flutter/widgets.dart` an earlier investigation pass assumed from a hand-written test stand-in
 * — an internal-file path the real SDK is free to reorganize across versions, which a full-path match
 * would have silently broken on. `name` is still checked exactly: the prefix alone would also match an
 * unrelated Flutter class of the same generic shape.
 */
function isFlutterType(type: Node | undefined, name: string): boolean {
  const library = type?.['library'];
  return typeof library === 'string' && library.startsWith('package:flutter/') && type?.['name'] === name;
}

/**
 * Whether `node` is a recognized `ScaffoldMessenger`-family call (ADR-0030 §6) — checked by the
 * *receiver's* own resolved type, never by the method's bare name alone (the M8-V numeric-method
 * pattern, extended past `dart:core`), so a project-defined class's own same-named method is untouched
 * and falls through to the ordinary lowering (a required negative control, ADR-0030 §6). Survives one
 * level of local-variable indirection (`final m = ScaffoldMessenger.of(context); m.showSnackBar(...)`,
 * ADR-0030 §6/G13) because the receiver's *resolved type* — not its shape — is what is checked.
 *
 * Exported so `component.ts`'s own `declareSnackbarHost` and `pipeline.ts`'s own program-wide scan can
 * ask the identical question, rather than three call sites drifting into three different definitions of
 * "recognized".
 */
export function isScaffoldMessengerCall(node: Node): boolean {
  const method = node['method'];
  if (typeof method !== 'string' || !SCAFFOLD_MESSENGER_METHODS.has(method)) return false;
  const receiver = node['receiver'] as Node | undefined;
  return isFlutterType(receiver?.['type'] as Node | undefined, 'ScaffoldMessengerState');
}

/** What a program-wide scan for `ScaffoldMessenger`-family shapes found (ADR-0030 §10). */
export interface ScaffoldMessengerSurvey {
  /** Whether the program calls a recognized `ScaffoldMessenger`-family method anywhere. */
  readonly needsHost: boolean;
  /** Whether the program constructs a `ScaffoldMessenger` widget anywhere — see {@link EmitScope.hasNestedScaffoldMessenger}. */
  readonly hasNestedMessenger: boolean;
}

/**
 * Walks the whole program once for both facts `pipeline.ts`'s `rootScope`/`generate` need before any
 * component is emitted: whether `providers.tsx` should declare a `SnackbarHostProvider` at all, and
 * whether every recognized call must refuse (ADR-0030 §10). One walk, not two — the same node can answer
 * both questions, and a document large enough for this to matter is exactly the case worth not walking
 * twice for.
 *
 * @param nodes - every node in the canonical program (`context.program.nodes` — top-level declarations;
 * this recurses into each one's own fields to reach the nested `logic.MethodCall`/`ui.Element` nodes a
 * component's render tree or an action's body actually carries).
 */
export function surveyScaffoldMessenger(nodes: readonly unknown[]): ScaffoldMessengerSurvey {
  let needsHost = false;
  let hasNestedMessenger = false;

  const visit = (value: unknown): void => {
    if (needsHost && hasNestedMessenger) return; // both already known; nothing left to learn
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const node = value as Node;
    if (node['kind'] === 'logic.MethodCall' && isScaffoldMessengerCall(node)) {
      needsHost = true;
    } else if (node['kind'] === 'ui.Element') {
      const component = node['component'] as Node | undefined;
      const library = component?.['library'];
      if (
        component?.['name'] === 'ScaffoldMessenger' &&
        typeof library === 'string' &&
        library.startsWith('package:flutter/')
      ) {
        hasNestedMessenger = true;
      }
    }
    for (const child of Object.values(node)) visit(child);
  };

  for (const node of nodes) visit(node);
  return { needsHost, hasNestedMessenger };
}

/**
 * Lowers a recognized `ScaffoldMessenger`-family call (ADR-0030) to the runtime kit's own snack bar
 * host — a hook the generator hoists to the top of this component's render body
 * (`component.ts`'s `declareSnackbarHost`), exactly the rules-of-hooks reason `routerLocal` is hoisted
 * rather than read at the call site. Never reaches an ordinary `MISSING_CAPABILITIES` refusal: every
 * shape this decision does not authorize is refused explicitly, here, with its own reason.
 */
function lowerScaffoldMessengerCall(node: Node, scope: EmitScope): string {
  const method = String(node['method'] ?? '');

  // §10: no nested-messenger semantics. Checked once, program-wide (`hasNestedScaffoldMessenger`,
  // `pipeline.ts`'s `rootScope`) — an explicit nested `ScaffoldMessenger` widget makes *every*
  // `.of(context)` in the program unprovable, not just the ones lexically near it (ADR-0030 §10, G14:
  // the analyzer has no structural link between a nested widget and a distant call site).
  if (scope.hasNestedScaffoldMessenger === true) {
    scope.report(
      GeneratorDiagnosticCode.UnsupportedCapability,
      'error',
      'this program constructs a `ScaffoldMessenger` widget explicitly, somewhere. Flutter resolves ' +
        '`ScaffoldMessenger.of(context)` to whichever messenger is nearest in the widget tree, and this ' +
        "generator cannot prove which messenger any *particular* call resolves to once more than one " +
        'exists — so every `ScaffoldMessenger`-family call in this program is refused, not just the ones ' +
        'textually near the nested widget (ADR-0030). Owner: an ADR extending root-messenger-only support.',
      idOf(node),
    );
    return REFUSED;
  }

  if (scope.snackbarHostLocal === undefined) {
    // Defensive only — `declareSnackbarHost` hoists this hook in every component that reaches a
    // recognized call, so a real generated program never observes this branch.
    scope.report(
      GeneratorDiagnosticCode.UnsupportedCapability,
      'error',
      'this call needs the snack bar host, which this component did not hoist. That is a defect in the ' +
        'generator, not in the program.',
      idOf(node),
    );
    return REFUSED;
  }

  // The receiver's own emitted text, not `scope.snackbarHostLocal` directly: for a direct call
  // (`ScaffoldMessenger.of(context).showSnackBar(...)`) the receiver *is* a recognized `logic.Call`
  // that already lowers to the hoisted host (this file's own `logic.Call` case, ADR-0030 §6/G13); for
  // one local-variable indirection (`final m = ScaffoldMessenger.of(context); m.showSnackBar(...)`) the
  // receiver is an ordinary `logic.Ref` to `m`, which already resolves to `m`'s own local name. Reading
  // `scope.snackbarHostLocal` here directly would bypass that local entirely, leaving `const m =
  // snackbarHost;` declared and never read — a real defect the build proof's own `tsc` step does not
  // catch (this generator's tsconfig sets no `noUnusedLocals`), so this is not a redundant precaution.
  const host = emitExpression(node['receiver'] as Node, scope);
  if (host === REFUSED) return REFUSED;

  switch (method) {
    case 'hideCurrentSnackBar':
      return `${host}.hide()`;
    case 'removeCurrentSnackBar':
      return `${host}.remove()`;
    case 'clearSnackBars':
      return `${host}.clear()`;
    case 'showSnackBar':
      return lowerShowSnackBar(node, scope, host);
    default:
      // Unreachable: `isScaffoldMessengerCall` only matches `SCAFFOLD_MESSENGER_METHODS`.
      return REFUSED;
  }
}

/**
 * `ScaffoldMessenger.of(context).showSnackBar(SnackBar(...))` — the one member of the family that
 * carries content (ADR-0030 §7/§8).
 */
function lowerShowSnackBar(node: Node, scope: EmitScope, snackbarHost: string): string {
  const args = asArray(node['args']);
  const snackBar = args[0];
  if (args.length !== 1 || snackBar === undefined || snackBar['kind'] !== 'logic.New') {
    // G17: an indirect reference (`final bar = SnackBar(...); ...showSnackBar(bar)`) — never recognized
    // (ADR-0030 §12). This generator only reaches a bare `logic.New` here in the first place because
    // extraction only ever set `presentedContent` on a *direct inline* construction (ADR-0030 §7); an
    // indirect reference is a `logic.Ref` here instead, which fails this check on its own `kind`.
    scope.report(
      GeneratorDiagnosticCode.UnsupportedCapability,
      'error',
      '`showSnackBar` is only supported with a direct, inline `SnackBar(...)` argument — a stored ' +
        'reference is not (ADR-0030). Write the `SnackBar(...)` directly in the call.',
      idOf(node),
    );
    return REFUSED;
  }

  const namedArgs = (snackBar['namedArgs'] as Record<string, Node> | undefined) ?? {};
  for (const key of Object.keys(namedArgs)) {
    if (!SNACKBAR_ALLOWED_ARGS.has(key)) {
      scope.report(
        GeneratorDiagnosticCode.UnsupportedCapability,
        'error',
        `\`SnackBar.${key}\` has no lowering. This generator supports \`content\`, \`action\` and ` +
          '`duration` (ADR-0030) — the narrow subset real Flutter/Dart-SDK evidence proved safe. A ' +
          'different property needs its own evidence before it can be added.',
        idOf(node),
      );
      return REFUSED;
    }
  }

  const contentNode = snackBar['presentedContent'] as Node | undefined;
  if (contentNode === undefined || scope.renderWidget === undefined) {
    // Extraction only sets `presentedContent` on the recognized direct-literal shape (ADR-0030 §7); its
    // absence here means this `SnackBar(...)` was reached some other way this generator does not (yet)
    // support, or (a unit test of this emitter alone) the widget-render hook is simply unwired.
    scope.report(
      GeneratorDiagnosticCode.UnsupportedCapability,
      'error',
      'this `SnackBar`’s own `content:` was not extracted as a real widget subtree — a defect in the ' +
        'compiler, not in the program, unless this `SnackBar` was reached some way other than a direct ' +
        '`ScaffoldMessenger.of(context).showSnackBar(SnackBar(...))` call (ADR-0030).',
      idOf(node),
    );
    return REFUSED;
  }
  const contentJsx = scope.renderWidget(contentNode, 1, scope);

  const options: string[] = [];

  const actionNode = namedArgs['action'];
  if (actionNode !== undefined) {
    const actionArgs = (actionNode['namedArgs'] as Record<string, Node> | undefined) ?? {};
    for (const key of Object.keys(actionArgs)) {
      if (!SNACKBAR_ACTION_ALLOWED_ARGS.has(key)) {
        scope.report(
          GeneratorDiagnosticCode.UnsupportedCapability,
          'error',
          `\`SnackBarAction.${key}\` has no lowering. This generator supports \`label\` and \`onPressed\` ` +
            'only (ADR-0030).',
          idOf(node),
        );
        return REFUSED;
      }
    }
    const label = actionArgs['label'];
    const onPressed = actionArgs['onPressed'];
    if (label !== undefined && onPressed !== undefined) {
      const labelText = emitExpression(label, scope);
      const onPressedText = emitExpression(onPressed, scope);
      if (labelText === REFUSED || onPressedText === REFUSED) return REFUSED;
      options.push(`action: { label: ${labelText}, onPress: ${onPressedText} }`);
    }
  }

  const durationNode = namedArgs['duration'];
  if (durationNode !== undefined) {
    const durationText = emitExpression(durationNode, scope);
    if (durationText === REFUSED) return REFUSED;
    options.push(`duration: ${durationText}`);
  }

  const optionsArg = options.length === 0 ? '' : `, { ${options.join(', ')} }`;
  return `${snackbarHost}.show(${contentJsx}${optionsArg})`;
}

/**
 * Lowers `logic.Assign` — the node the schema singles out as the dangerous one.
 *
 * > Distinct from `sig.Action.writes`, and not replaceable by it: `writes` is a data-flow summary (*which*
 * > signals change), while this is program semantics (*what they become*). Both are required.
 *
 * `AssignmentOperator` is a **closed enum**, unlike `Binary.operator`, and this handles every member. A
 * missing one is reported rather than passed through, because — in the schema's own words — *"a wrong
 * assignment operator writes the wrong value to state."*
 */
function emitAssignment(node: Node, scope: EmitScope): string {
  const operator = String(node['operator'] ?? '');
  const target = node['target'] as Node;
  const targetText = emitTarget(target, scope);
  const valueNode = node['value'] as Node | undefined;

  if (operator === 'increment' || operator === 'decrement') {
    // `isPostfix` is only observable when the expression's *value* is used (`x++` vs `++x`). As a statement
    // they are identical, and that is how actions use them.
    const step = operator === 'increment' ? '+ 1' : '- 1';
    return assignTo(target, targetText, `${readTarget(target, targetText, scope)} ${step}`, scope);
  }

  const value = emitExpression(valueNode, scope);
  const read = (): string => readTarget(target, targetText, scope);

  switch (operator) {
    case 'assign':
      return assignTo(target, targetText, value, scope);
    case 'addAssign':
      return assignTo(target, targetText, `${read()} + ${value}`, scope);
    case 'subtractAssign':
      return assignTo(target, targetText, `${read()} - ${value}`, scope);
    case 'multiplyAssign':
      return assignTo(target, targetText, `${read()} * ${value}`, scope);
    case 'divideAssign':
      return assignTo(target, targetText, `${read()} / ${value}`, scope);
    case 'truncatingDivideAssign':
      // `~/=`. Toward zero — `Math.floor` is wrong for negatives, which is why the schema calls this out.
      return assignTo(target, targetText, `Math.trunc(${read()} / ${value})`, scope);
    case 'moduloAssign':
      // `%=`. Dart's modulo is non-negative for a positive divisor; JavaScript's is not.
      return assignTo(target, targetText, `(((${read()}) % (${value})) + (${value})) % (${value})`, scope);
    case 'ifNullAssign':
      return assignTo(target, targetText, `${read()} ?? ${value}`, scope);
    case 'bitAndAssign':
      return assignTo(target, targetText, `${read()} & ${value}`, scope);
    case 'bitOrAssign':
      return assignTo(target, targetText, `${read()} | ${value}`, scope);
    case 'bitXorAssign':
      return assignTo(target, targetText, `${read()} ^ ${value}`, scope);
    case 'shiftLeftAssign':
      return assignTo(target, targetText, `${read()} << ${value}`, scope);
    case 'shiftRightAssign':
      return assignTo(target, targetText, `${read()} >> ${value}`, scope);
    case 'unsignedShiftRightAssign':
      return assignTo(target, targetText, `${read()} >>> ${value}`, scope);
    default:
      scope.report(
        GeneratorDiagnosticCode.UnsupportedExpression,
        'error',
        `the assignment operator \`${operator}\` has no lowering. A wrong assignment operator writes the ` +
          `wrong value to state, so this is refused rather than approximated.`,
        idOf(node),
      );
      return 'undefined';
  }
}

/** The signal a `logic.Ref` target names, if it is one. */
function signalTargetOf(target: Node, scope: EmitScope): string | undefined {
  if (kindOf(target) !== 'logic.Ref') return undefined;
  const id = target['target'];
  return typeof id === 'string' && scope.signalRead(id) !== undefined ? id : undefined;
}

/** The place being written, as text — used when the target is an ordinary lvalue. */
function emitTarget(target: Node, scope: EmitScope): string {
  if (kindOf(target) === 'logic.Ref') {
    const id = target['target'];
    if (typeof id === 'string') {
      const local = scope.localName(id);
      if (local !== undefined) return local;
    }
    const name = target['name'];
    if (typeof name === 'string') return identifierOf(name);
  }
  return emitExpression(target, scope);
}

/** Reads the current value of the place being written. */
function readTarget(target: Node, targetText: string, scope: EmitScope): string {
  const signal = signalTargetOf(target, scope);
  // `peek`, not `get`. A read-modify-write inside an action must not subscribe the enclosing computation to
  // the signal it writes — the kit's own `update` does exactly this, for exactly this reason.
  if (signal !== undefined) return `${signalName(signal, scope)}.peek()`;
  return targetText;
}

/** The identifier of a signal object in scope — asked for directly, never parsed out of a read. */
function signalName(id: string, scope: EmitScope): string {
  return scope.signalLocal(id) ?? '';
}

/**
 * Writes to the place.
 *
 * A signal is written with `.set(...)`, never `=`. This is the whole reason the generator knows which
 * `logic.Ref`s are signals: `count = count + 1` in Dart is `count.set(count.peek() + 1)` here, and emitting
 * the assignment verbatim would rebind a local and leave the state untouched — generated React state that
 * never updates, which is the defect `sig.Action`'s own schema doc warns about.
 */
function assignTo(target: Node, targetText: string, value: string, scope: EmitScope): string {
  const signal = signalTargetOf(target, scope);
  if (signal !== undefined) return `${signalName(signal, scope)}.set(${value})`;
  return `${targetText} = ${value}`;
}
