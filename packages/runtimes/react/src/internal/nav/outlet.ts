// The thing that puts the navigation stack on screen.
//
// ## Why this did not exist, and what its absence cost
//
// `createRouter` has maintained a reactive stack since M3-A: `push`, `replace`, `pop`, a `current`
// derived, a `Destination` union that mirrors Spec v2.4 §A17 exactly. Everything except a consumer.
//
// M7-C found what that meant in practice. `BRG3008` refuses an inline push — `Navigator.push(context,
// MaterialPageRoute(builder: (_) => Detail()))` — and its stated reason was that the *URL* for a
// path-less destination is a legalization decision the generator declines to make. But the kit already
// answers that: a `component` destination has `path: undefined` and §A17.6 says none is invented. No URL
// was ever needed.
//
// The real blocker was here. A `router.push({kind: 'component', …})` would have pushed an entry onto a
// stack **nothing rendered**, so the emitted application would have compiled, run, and done nothing
// visible when the button was pressed. That is the failure mode this project refuses above all others —
// worse than a refusal, because it looks like success.
//
// ## The identity question
//
// A pushed destination names a component, and something has to turn that name into a React element. The
// kit cannot import the application's components — it is a library, and they are generated. So the map
// is passed in, and `Destination.component` is documented as *"the kit's identity for the pushed
// component — the generator's stand-in for its `ui.Component` id"*. This is that stand-in's other end.
//
// Two maps rather than one, because the two destination kinds are two namespaces: a route is named by
// its entry in the route table, a component by its node identity. Merging them would make a route called
// `detail` and a component whose id happens to be `detail` the same key, and the collision would be
// silent — the wrong screen, not an error.

import { createElement, Fragment, type ComponentType, type ReactElement, type ReactNode } from 'react';

import { useSignal } from '../react/hooks.js';
import { useRouter } from '../react/context.js';
import type { RouteEntry } from './router.js';

/** Props for {@link RouterOutlet}. */
export interface RouterOutletProps {
  /**
   * The component each **declared route** renders, keyed by its name in the route table.
   *
   * The same names `RouterDescriptor.routes[].name` carries, so a descriptor and an outlet built from
   * one program cannot disagree about what a route is called.
   */
  readonly routes: Readonly<Record<string, ComponentType<any>>>;
  /**
   * The component each **inline destination** renders, keyed by the identity a push carries.
   *
   * Separate from {@link routes} on purpose: an inline destination has no path and no route-table entry
   * (§A17.6), so it has no name to look up there.
   */
  readonly components?: Readonly<Record<string, ComponentType<any>>>;
  /**
   * Rendered when the top of the stack names nothing either map knows.
   *
   * Defaults to nothing. A destination the outlet cannot render is a **generator** defect — it emitted a
   * push whose target it did not also register — so this is a seam for a host to surface that, not a
   * place for the kit to invent a screen.
   */
  readonly fallback?: ReactNode;
}

/**
 * Renders the navigation stack: the entry on top is what the user sees, and **every entry beneath it stays mounted.**
 *
 * That is what a Flutter `Navigator` does, and it is not an optimisation. The route underneath a `push` is alive — its
 * `State` objects, its text fields, its scroll positions, its in-flight futures — and a `pop` returns to it exactly as
 * it was. Rendering only the top unmounted it on every push, so popping remounted a fresh screen: a counter went back
 * to zero, a half-typed form emptied, and a closure the destination held over the pushing screen's `setState` wrote
 * into a component that no longer existed. None of that is visible in a program that pushes constant arguments and
 * keeps its state in a store — which is the only kind this outlet had ever been shown — and all of it is what an
 * ordinary application does.
 *
 * The screens beneath are hidden with `display: none`, so they take no space, cannot be focused or read out, and cost
 * nothing to lay out. Their identity is the entry's own: a `push` mounts one new screen and leaves the rest alone, and a
 * `pop` unmounts exactly the one that left.
 *
 * `display: contents` on the top entry's wrapper means the wrapper is not a box: the screen lays out as if it were the
 * outlet's own child.
 *
 * @param props - see {@link RouterOutletProps}.
 * @returns the elements for the stack, oldest first.
 */
export function RouterOutlet(props: RouterOutletProps): ReactElement | null {
  const router = useRouter();
  const stack = useSignal(router.stack);

  // **Every entry stays mounted; only the top is shown.** Flutter's `Navigator` keeps the routes beneath the top one in
  // the tree, off stage — so a screen that pushed another and is popped back to is *the same screen*, with its state, its
  // text fields, and the closures it handed the pushed screen still able to write to it. Rendering only the top entry
  // unmounted the screen below on every push: it came back freshly constructed, and a closure it had passed forward
  // wrote into a component that no longer existed.
  //
  // `display: contents` on the visible entry's wrapper takes the wrapper out of layout, so the screen lays out exactly as
  // it did when it was the only child; `display: none` and `inert` take the others out of sight and out of the tab order.
  return createElement(
    Fragment,
    null,
    stack.map((entry, index) => {
      const top = index === stack.length - 1;
      const screen = screenOf(entry, props);
      // Deliberately not an exception for an entry nothing renders — see `fallback`.
      const content = screen === undefined ? (top ? props.fallback : null) : screen;
      return createElement(
        'div',
        {
          key: identityOf(entry),
          style: { display: top ? 'contents' : 'none' },
          ...(top ? {} : { inert: true, 'aria-hidden': true }),
        },
        content,
      );
    }),
  );
}

/** A stack entry's stable identity — entries are frozen objects, and a stack that drops one keeps the others' keys. */
const identities = new WeakMap<RouteEntry, number>();
let nextIdentity = 0;

function identityOf(entry: RouteEntry): number {
  let identity = identities.get(entry);
  if (identity === undefined) {
    identity = nextIdentity++;
    identities.set(entry, identity);
  }
  return identity;
}

/** The element an entry renders, or `undefined` when neither map knows its destination. */
function screenOf(entry: RouteEntry, props: RouterOutletProps): ReactElement | undefined {
  const destination = entry.destination;
  const component =
    destination.kind === 'route' ? props.routes[destination.route] : props.components?.[destination.component];
  if (component === undefined) return undefined;

  // An inline destination hands its component the values its push carried (`Destination.props`) — the generator put them
  // there, in the component's own prop names, so the kit is passing on a prop object it was given rather than guessing at
  // a signature. A route's arguments are constants the page module already bound into the screen.
  return createElement(component, destination.kind === 'component' ? destination.props : undefined);
}
