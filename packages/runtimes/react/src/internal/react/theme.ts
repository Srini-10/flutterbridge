// The theme surface, as a hook — the one line every Material component writes.
//
// ## Why this is not in `context.ts`
//
// `context.ts` owns *provision*: it makes the instances and puts them in scope, and ADR-15 is the reason it
// exists. This owns *consumption*, and the distinction matters because the two have different failure modes.
// A bug in provision is a privacy defect (one request's store on another request's screen). A bug here is a
// component that does not repaint when the theme flips — the `sig.Action` schema's own warning, "generated
// React state that never updates".
//
// ## Why `useSignal` and not `useContext` alone
//
// The theme is in a context, but the *brightness* is a signal inside it, and a context does not re-render on
// a signal write. A component that read `useTheme()` and called `theme.color(...)` outside a reactive read
// would resolve the right colour once and never again: dark mode would flip the signal, every subscriber in
// the signal graph would re-run, and this component — subscribed to nothing — would sit there in light
// colours. So the brightness is read through `useSignal`, which is the subscription, and the surface is built
// for that value.
//
// This is also what makes the whole thing SSR-safe. `useSignal` reads a value and subscribes; on the server
// there is no subscription to run and the read is just a read, so `renderToString` resolves the same tokens
// the client's first paint will. There is no `window.matchMedia`, no `localStorage`, no effect that would
// make the server and the client disagree — which is what a hydration mismatch is.

import { useMemo } from 'react';

import { createThemeSurface, type ThemeSurface } from '../theme/surface.js';
import { useSignal } from './hooks.js';
import { useTheme } from './context.js';

/**
 * The theme surface for the enclosing `ThemeProvider`, at the current brightness.
 *
 * Subscribes the calling component to brightness: flipping it re-renders every component that called this,
 * and nothing else. That is the whole of theme reactivity — there is no theme-changed event to subscribe to,
 * because ADR-4 says reactivity is the signal graph and the theme is not an exception to it.
 *
 * The returned object is memoised on `(theme, brightness)`, so it is referentially stable between renders and
 * safe as a dependency of `useMemo`/`useEffect`. Two components under one provider at one brightness get the
 * same object.
 *
 * @returns the surface. See {@link ThemeSurface} for the accessors.
 * @throws RuntimeError - `BRG4005` if there is no enclosing `ThemeProvider`.
 *
 * @example
 * ```ts
 * // What a themed component writes, in full.
 * const theme = useThemeSurface();
 * const style = { borderBottomColor: theme.color('outlineVariant') };
 * ```
 */
export function useThemeSurface(): ThemeSurface {
  const theme = useTheme();
  const brightness = useSignal(theme.brightness);
  return useMemo(() => createThemeSurface(theme, brightness), [theme, brightness]);
}
