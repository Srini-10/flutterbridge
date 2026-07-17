// Text — a string, and nothing else.
//
// ## Why `<span>`
//
// Flutter's `Text` paints a string and imposes no layout of its own; `<span>` is the element that does the
// same. A `<div>` would be block-level, so two `Text`s side by side in a `Row` would each claim a line —
// a line break nobody wrote, from an element chosen for no reason.
//
// ## Why `children: string` and not `ReactNode`
//
// `Text` takes `String data` in Flutter. It is not a slot: the catalog gives `Text` a `role` ("text") and no
// `slots` at all, where every wrapper gets `"slots": ["child"]`. Widening this to `ReactNode` would accept a
// nested widget that no Dart `Text` could have contained, so no generator could ever emit it — the type
// would be advertising a capability that exists only by accident. Rich text is `Text.rich`/`RichText` in
// Flutter and is a different widget; when it lands it lands as one.
//
// ## No colour, and no style at all (INV-20)
//
// ADR-13: "every colour a mapped Material widget paints must resolve to an `app.Token`. Generated code and
// kit components contain no literal colour values." Text's colour in Flutter comes from `DefaultTextStyle`,
// which comes from the theme — `onSurface`, a token. Until `TextStyle` is mapped and can resolve it, this
// paints nothing and inherits the cascade. A hardcoded `#000` here would be a colour no token accounts for,
// no Figma sync would export, and no brightness flip would move: black text on a dark surface, shipped, with
// every test green. ADR-13 measured what guessed colours cost — up to 15/255 per channel — and this is the
// same guess for none of the benefit.

import { createElement, type ReactElement } from 'react';

/** Props for {@link Text}. */
export interface TextProps {
  /**
   * The string to render. Flutter's `String data`.
   *
   * A string, not a `ReactNode` — see this file's header on why the narrower type is the honest one.
   */
  readonly children: string;
}

/**
 * Flutter's `Text` — renders a string.
 *
 * Unstyled by design: colour, size and weight are `TextStyle`'s, and `TextStyle` resolves through the theme
 * to tokens (INV-20, ADR-13). This widget's job is the string.
 *
 * @param props - see {@link TextProps}.
 * @returns the string, in a `<span>`.
 *
 * @example
 * ```ts
 * // Text('hello')
 * createElement(Text, null, 'hello');
 * createElement(Text, { children: 'hello' });   // the same element
 * ```
 */
export function Text(props: TextProps): ReactElement {
  return createElement('span', null, props.children);
}
