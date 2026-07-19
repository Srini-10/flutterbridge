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

import { createElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';

import { textAlign, type TextAlign } from '../layout/alignment.js';
import { useThemeSurface } from '../react/theme.js';

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

// ── RichText and TextSpan ─────────────────────────────────────────────────────────────────────────
//
// A `TextSpan` is a *tree of styled runs*, not a widget tree: it nests, each level may restyle, and the
// result is one paragraph that wraps across the whole of it. That is exactly what nested `<span>`s in one
// block element do, and it is why `RichText` cannot be built out of `Text` widgets — each `Text` would be its
// own paragraph and the runs would stop sharing a line.

/** One styled run of text — the runtime form of Flutter's `TextSpan`. */
export interface TextSpanOptions {
  /** This run's text. A span may have children instead, or as well. */
  readonly text?: string;
  /** Nested runs, which inherit this span's style. */
  readonly children?: readonly TextSpan[];
  /** The Material role to paint this run in. Flutter's `style.color`, resolved as a role (INV-20). */
  readonly colorRole?: string;
  /** The run's size, in logical pixels. Flutter's `style.fontSize`. */
  readonly fontSize?: number;
  /** The run's weight, 100–900. Flutter's `FontWeight`, whose `w700` *is* CSS's `700`. */
  readonly fontWeight?: number;
}

/**
 * Flutter's `TextSpan`, as a constructible value.
 *
 * Named arguments become one options object, which is the kit's convention for every mirrored value type and
 * what the generator's kit-provided lowering emits.
 *
 * Flutter's `style` is a whole `TextStyle`; this carries the three fields that map without the typography
 * tokens no compiler pass emits yet. A span whose style sets anything else is reported by the generator
 * rather than rendered unstyled — silence about a bold run is a paragraph that reads differently.
 */
export class TextSpan implements TextSpanOptions {
  /** This run's text. */
  public readonly text?: string;
  /** Nested runs. */
  public readonly children?: readonly TextSpan[];
  /** The Material role to paint in. */
  public readonly colorRole?: string;
  /** The size, in logical pixels. */
  public readonly fontSize?: number;
  /** The weight, 100–900. */
  public readonly fontWeight?: number;

  public constructor(options: TextSpanOptions = {}) {
    if (options.text !== undefined) this.text = options.text;
    if (options.children !== undefined) this.children = options.children;
    if (options.colorRole !== undefined) this.colorRole = options.colorRole;
    if (options.fontSize !== undefined) this.fontSize = options.fontSize;
    if (options.fontWeight !== undefined) this.fontWeight = options.fontWeight;
  }
}

/** Props for {@link RichText}. Flutter's `RichText`. */
export interface RichTextProps {
  /** The span tree. Required, as in Flutter. */
  readonly text: TextSpanOptions;
  /** How the paragraph is aligned. Defaults to `start`, as in Flutter. */
  readonly textAlign?: TextAlign;
  /** Whether it wraps. Defaults to `true`, as in Flutter. */
  readonly softWrap?: boolean;
  /** The most lines to render before truncating. */
  readonly maxLines?: number;
}

/**
 * Flutter's `RichText` — one paragraph of differently styled runs.
 *
 * Renders the span tree as nested `<span>`s inside one block, so every run shares the paragraph's line
 * breaking — which is the whole point of a span tree and the thing a stack of `Text` widgets cannot do.
 *
 * `maxLines` uses the line-clamp box, which is the only way CSS truncates at a *line* count rather than a
 * character count. `overflow: TextOverflow.fade` is not mapped: it needs a gradient mask, and a fade rendered
 * as an ellipsis is a visibly different paragraph.
 *
 * @param props - see {@link RichTextProps}.
 * @returns the paragraph.
 * @throws RuntimeError - `BRG4006` if a span names a role the theme does not define.
 */
export function RichText(props: RichTextProps): ReactElement {
  const theme = useThemeSurface();

  const spanStyle = (span: TextSpanOptions): CSSProperties => {
    const style: CSSProperties = {};
    if (span.colorRole !== undefined) style.color = theme.color(span.colorRole);
    if (span.fontSize !== undefined) style.fontSize = span.fontSize;
    if (span.fontWeight !== undefined) style.fontWeight = span.fontWeight;
    return style;
  };

  // Recursive, because the model is: a span's children inherit its style, and CSS inheritance does that for
  // free once the nesting matches.
  const renderSpan = (span: TextSpanOptions, key: number): ReactElement =>
    createElement(
      'span',
      { key, style: spanStyle(span) },
      span.text,
      ...(span.children ?? []).map((child, index) => renderSpan(child, index)),
    );

  const paragraph: CSSProperties = {
    textAlign: textAlign(props.textAlign) as CSSProperties['textAlign'],
    whiteSpace: props.softWrap === false ? 'nowrap' : 'normal',
  };
  if (props.maxLines !== undefined) {
    paragraph.display = '-webkit-box';
    paragraph.WebkitBoxOrient = 'vertical';
    paragraph.WebkitLineClamp = props.maxLines;
    paragraph.overflow = 'hidden';
  }

  return createElement('p', { style: paragraph }, renderSpan(props.text, 0));
}

/** Props for {@link SelectableText}. Flutter's `SelectableText`. */
export interface SelectableTextProps {
  /** The string. Flutter's positional `data` argument, named by the catalog. */
  readonly data?: string;
  /** How the text is aligned. */
  readonly textAlign?: TextAlign;
  /** The string, when it arrives as React children. */
  readonly children?: ReactNode;
}

/**
 * Flutter's `SelectableText` — text the user can select and copy.
 *
 * The inverse of most of this kit's work: web text is selectable by default, and Flutter's is not. So
 * `SelectableText` is a `Text` that does *not* opt out of selection, and the interesting question is what the
 * plain `Text` does — which is nothing, because this kit has never suppressed selection. The distinction is
 * therefore preserved in the semantics rather than in the paint: `user-select: text` is stated explicitly so
 * that a `SelectableText` inside a subtree that disabled selection still selects.
 *
 * @param props - see {@link SelectableTextProps}.
 * @returns the selectable text.
 */
export function SelectableText(props: SelectableTextProps): ReactElement {
  const style: CSSProperties = {
    userSelect: 'text',
    textAlign: textAlign(props.textAlign) as CSSProperties['textAlign'],
  };
  return createElement('span', { style }, props.data ?? props.children);
}
