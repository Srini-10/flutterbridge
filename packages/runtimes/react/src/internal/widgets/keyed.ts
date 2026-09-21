// A Dart `List<Widget>` as a React child list — with the keys React needs (ADR-0074).
//
// Flutter identifies a list's children by position (and an optional `Key`); React wants a `key` on every element of an array it renders.
// A list literal `[Text('a'), if (x) Text('b'), for (…) Text('$i')]` is built at run time from parts of unknown count, so there is no
// static key to write — and a list rendered without keys is a defect React reports only on the console. `Children.toArray` assigns each
// element a key derived from its position (and keeps an explicit `key:` a widget carries), flattening nested arrays and dropping
// `null`/`false`, which a Dart `List<Widget>` cannot hold anyway.

import { Children, Fragment, createElement, type ReactNode } from 'react';

/**
 * A widget value rendered as a child: a `List<Widget>` becomes a fragment of positionally-keyed children, anything else is itself.
 *
 * A list is not rendered *as an array*: React demands keys of every element of an array child, reports a missing one only on the console, and —
 * measured — also reports one for an element passed down as a prop when a container renders several array children (`[element, list, list]`
 * warns; the same three as fragments do not). `Children.toArray` gives each element a key derived from its position (keeping an explicit `key:`),
 * which is what Flutter's position-based matching is; the fragment's children are then positional arguments, never an array.
 */
export function widgetNodes(value: ReactNode): ReactNode {
  return Array.isArray(value) ? createElement(Fragment, null, ...Children.toArray(value as ReactNode[])) : value;
}
