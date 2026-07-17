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

import { useEffect, useRef } from 'react';

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
