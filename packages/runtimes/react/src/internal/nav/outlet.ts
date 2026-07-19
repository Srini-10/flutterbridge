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

import { createElement, type ComponentType, type ReactElement, type ReactNode } from 'react';

import { useSignal } from '../react/hooks.js';
import { useRouter } from '../react/context.js';

/** Props for {@link RouterOutlet}. */
export interface RouterOutletProps {
  /**
   * The component each **declared route** renders, keyed by its name in the route table.
   *
   * The same names `RouterDescriptor.routes[].name` carries, so a descriptor and an outlet built from
   * one program cannot disagree about what a route is called.
   */
  readonly routes: Readonly<Record<string, ComponentType>>;
  /**
   * The component each **inline destination** renders, keyed by the identity a push carries.
   *
   * Separate from {@link routes} on purpose: an inline destination has no path and no route-table entry
   * (§A17.6), so it has no name to look up there.
   */
  readonly components?: Readonly<Record<string, ComponentType>>;
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
 * Renders the top of the navigation stack.
 *
 * Subscribes to `router.current`, which is a derived over the stack signal, so a `push` or a `pop`
 * re-renders exactly this component and nothing above it.
 *
 * @param props - see {@link RouterOutletProps}.
 * @returns the element for the current entry.
 */
export function RouterOutlet(props: RouterOutletProps): ReactElement | null {
  const router = useRouter();
  const current = useSignal(router.current);
  const destination = current.destination;

  const component =
    destination.kind === 'route'
      ? props.routes[destination.route]
      : props.components?.[destination.component];

  if (component === undefined) {
    // Deliberately not an exception. A missing entry means the generated project is inconsistent with
    // itself, and throwing here would replace a blank region with a crashed application — the same
    // information, delivered by destroying the rest of the screen.
    return (props.fallback ?? null) as ReactElement | null;
  }

  // No props are passed. A route's arguments are `RouteArgument`s the compiler has not yet wired
  // (ADR-0025 D1 is schema-only), and inventing a prop object here would be the kit guessing at a
  // component's signature — which is the generator's business and nobody else's.
  return createElement(component);
}
