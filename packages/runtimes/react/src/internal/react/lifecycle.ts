// Component lifecycle helpers — `sig.Effect.timing` mapped onto React.
//
// ## The mapping, and where it comes from
//
// `catalog/widgets/material.json` is the single declarative source (ADR-18) and states it exactly:
//
//     "lifecycle": {
//       "initState": "mount",
//       "didUpdateWidget": "update",
//       "didChangeDependencies": "update",
//       "dispose": "unmount"
//     }
//
// So `EffectTiming` is `mount | update | unmount`, and extraction has already folded four Flutter callbacks
// into those three. This module lands each on React. Nothing here re-derives the mapping — that would be
// hand-writing framework metadata in a second language, which is the mistake ADR-18 records the project
// having paid for twice.
//
// ## Why these are not just `useEffect`
//
// `mount` and `unmount` are `useEffect(fn, [])` and its cleanup, near enough — but writing that at every
// call site puts a bare `[]` in generated code, which is the single most misread expression in React and
// looks like an oversight in review. Naming them says which Flutter callback produced them.
//
// `update` genuinely is not `useEffect`: `didUpdateWidget` runs on updates and **not** on the first build,
// where `useEffect` runs on both. Emitting `useEffect` for a `didUpdateWidget` body would run it once too
// often, on mount, forever — a fidelity bug invisible in any golden, because the extra run usually
// converges to the same state.
//
// ## What is NOT here
//
// A reactive effect — one that re-runs when a signal it read changes — is `useSignalEffect` in `hooks.ts`.
// These three are lifecycle: they fire on React's schedule, not the graph's. ADR-20 is explicit that the
// split is deliberate: "`sig.Effect.timing` is not modelled by R1–R8. `mount`/`update`/`unmount` are
// *component lifecycle*, which React owns; the graph knows only 'an effect that reruns when its
// dependencies change'."

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';

/**
 * Runs `body` once, after the component first mounts — the runtime form of a `sig.Effect` with
 * `timing: 'mount'` (Flutter's `initState`).
 *
 * A returned cleanup runs on unmount, which is the `initState`/`dispose` pairing.
 *
 * @param body - the effect. May return a cleanup function.
 *
 * @example
 * ```ts
 * useMountEffect(() => {
 *   const subscription = source.listen(onData);
 *   return () => subscription.cancel();
 * });
 * ```
 */
export function useMountEffect(body: () => void | (() => void)): void {
  const bodyRef = useRef(body);
  bodyRef.current = body;
  useEffect(() => bodyRef.current(), []);
}

/**
 * Runs `body` once, when the component unmounts — the runtime form of a `sig.Effect` with
 * `timing: 'unmount'` (Flutter's `dispose`).
 *
 * @param body - the effect.
 *
 * @example
 * ```ts
 * useUnmountEffect(() => controller.dispose());
 * ```
 */
export function useUnmountEffect(body: () => void): void {
  const bodyRef = useRef(body);
  bodyRef.current = body;
  useEffect(
    () => () => {
      bodyRef.current();
    },
    [],
  );
}

/**
 * Runs `body` when `dependencies` change, but **not** on the first render — the runtime form of a
 * `sig.Effect` with `timing: 'update'` (Flutter's `didUpdateWidget` / `didChangeDependencies`).
 *
 * The skipped first run is the whole point: `didUpdateWidget` does not run on the initial build, and a
 * plain `useEffect` does. See this file's header.
 *
 * @param body - the effect. May return a cleanup function, which runs before each subsequent run and on
 * unmount.
 * @param dependencies - what constitutes an update. An empty array means the effect never runs, which is
 * consistent — nothing ever changed.
 *
 * @example
 * ```ts
 * useUpdateEffect(() => { controller.setValue(value); }, [value]);
 * ```
 */
export function useUpdateEffect(
  body: () => void | (() => void),
  dependencies: readonly unknown[],
): void {
  const bodyRef = useRef(body);
  bodyRef.current = body;
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return undefined;
    }
    return bodyRef.current();
  }, dependencies);
}

/**
 * The live component-instance liveness flag — the runtime form of `logic.Intrinsic{intrinsic:
 * 'componentMounted' | 'contextMounted'}` (ADR-0026), Flutter's `State.mounted`/`BuildContext.mounted`.
 *
 * ## Why a ref, not a boolean
 *
 * `mounted`'s whole reason for existing in Flutter is checking liveness **after an `await`** —
 * `await operation(); if (!mounted) return;`. A plain boolean returned from this hook would be a value
 * captured by the calling closure at the render that created it; a unmount happening during the `await`
 * could never change what that closure already holds. Only something read *at call time* — this ref's
 * `.current` — can reflect an unmount that happens while the caller is suspended. See
 * `docs/m7/m7i-mounted-lifecycle-lowering.md` for the fuller derivation, including why a getter function
 * would have worked exactly as well and a ref was chosen because it is this kit's own existing idiom
 * (`useUpdateEffect`'s internal `mounted` ref, above, tracks a different fact the same way).
 *
 * ## Why `true` is set inside the effect, not only at `useRef`'s initial value
 *
 * React Strict Mode replays every effect once in development — mount → cleanup → mount again — to
 * surface exactly the class of bug an incorrectly-implemented liveness flag would be. Setting `current`
 * only at `useRef(true)` and never again would leave it `false` after that replay's cleanup runs, even
 * though the component is genuinely still mounted. Re-setting `true` inside the effect body means the
 * replay's second mount restores the correct value.
 *
 * Per-instance by construction — `useRef` is component-instance hook state, so two mounted instances of
 * the same component are isolated automatically, and nothing here is module-global (ADR-15/INV-19).
 * Writing a ref is not a `useState` call, so this causes no rerender on its own, on mount, or on unmount.
 *
 * @returns a ref whose `.current` is `true` while the component is mounted, `false` from the moment it
 * unmounts (and forever after, for this instance — a new mount gets a new ref).
 *
 * @example
 * ```ts
 * const mounted = useMounted();
 * const handleSubmit = async () => {
 *   await authenticate();
 *   if (!mounted.current) return;
 *   router.push(destination);
 * };
 * ```
 */
export function useMounted(): RefObject<boolean> {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}

/**
 * Runs `init` once, **during the first render** and before anything is drawn — the runtime form of the leading run of
 * pure state assignments in `initState` (ADR-0052).
 *
 * Flutter's `initState` runs before the first `build`, so `initState() { _n = 5; }` shows 5 on the first frame; an
 * effect runs after the first commit and would show the field's declared value first.
 *
 * ## Exactly once, even under StrictMode
 *
 * The first version was `useState(() => { init(); return null; })` and called "idempotent". It is not: in development,
 * React invokes a `useState` initialiser **twice** and keeps the first result, so `init` ran twice against the *same*
 * signals, and `_n = _n + 41` gave 83 instead of 42 (found by the browser proof, `state-semantics.dev-only.spec.ts`). A
 * guard held in the hook's own state runs it once per kept instance: the discarded extra call creates a discarded guard.
 *
 * @param init - the state initialisation. It writes only to the component's own signals.
 */
export function useInitState(init: () => void): void {
  const [guard] = useState(() => ({ done: false }));
  if (!guard.done) {
    guard.done = true;
    init();
  }
}

/**
 * The runtime form of `initState` (its effectful remainder) and `dispose` together — one effect, so that an `init` and
 * its `dispose` always pair (ADR-0052).
 *
 * `init` runs once after the first commit; `dispose` runs exactly once when the component unmounts. In development
 * StrictMode React mounts, unmounts and mounts again, so the sequence is `init, dispose, init` — a symmetric
 * `dispose` (`removeListener`, `cancel`) leaves the component correct, which is the same contract Flutter's
 * `initState`/`dispose` pair already asks of a `State`. Both callbacks are read from the **latest** render, so
 * a `dispose` that reads `widget.x` sees the current widget, as it does in Flutter.
 *
 * @param hooks - `init` and/or `dispose`.
 */
export function useLifecycle(hooks: { readonly init?: () => void; readonly dispose?: () => void }): void {
  const latest = useRef(hooks);
  latest.current = hooks;
  useEffect(() => {
    latest.current.init?.();
    return () => {
      latest.current.dispose?.();
    };
  }, []);
}

/**
 * The runtime form of `didUpdateWidget(oldWidget)`: runs after a render in which the parent supplied **new props**, with
 * the previous props, and never on the first render (ADR-0052).
 *
 * Flutter calls `didUpdateWidget` whenever the parent rebuilds and hands the `State` a new widget instance — even if
 * every field is equal — and not when the `State` rebuilds itself (`setState`). React has the same distinction:
 * a component re-rendered for its own state keeps the *same* `props` object, one re-rendered by its parent gets a new
 * one. So identity of `props` is the trigger, not a shallow comparison.
 *
 * @param props - the component's props object.
 * @param update - the body, given the previous props.
 */
export function useDidUpdateWidget<P>(props: P, update: (oldWidget: P) => void): void {
  const previous = useRef(props);
  const latest = useRef(update);
  latest.current = update;
  useEffect(() => {
    if (previous.current === props) return;
    const old = previous.current;
    previous.current = props;
    latest.current(old);
  });
}

/** A component's props with every omission resolved: optional keys are required and never `undefined`. */
export type ResolvedProps<P> = { readonly [K in keyof P]-?: Exclude<P[K], undefined> };

/**
 * Resolves the props a caller omitted to the defaults the Dart constructor declares (`this.nested = false`), or `null`
 * for an omitted nullable one — Dart has one absent value and it is `null`, JSX's is `undefined` (ADR-0053).
 *
 * The result is memoised on the **props object**, so it is a new object exactly when React handed the component a new one:
 * that is what lets `useDidUpdateWidget` tell a parent's rebuild from the component's own re-render.
 *
 * @param raw - the props React passed.
 * @param defaults - one entry per optional parameter: its default, or `null`.
 */
export function useDefaults<P extends object>(
  raw: P,
  defaults: { readonly [K in keyof P]?: P[K] | null },
): ResolvedProps<P> {
  // The defaults object is a fresh literal each render; it is read only when `raw` changed, so it is not a dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => {
    const resolved: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
    for (const [key, value] of Object.entries(defaults)) {
      if (resolved[key] === undefined) resolved[key] = value;
    }
    return resolved as ResolvedProps<P>;
  }, [raw]);
}
