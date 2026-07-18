// Image and Icon — the two widgets that paint something the app supplies rather than something CSS draws.
//
// ## One `Image`, two spellings
//
// Flutter has one `Image` widget and four ways to name its bytes, and the M4-C analyzer probe showed both
// spellings reaching UIR intact:
//
//     Image.asset('images/logo.png')        →  props.name  = 'images/logo.png'
//     Image.network('https://…')            →  props.src   = 'https://…'
//     Image(image: AssetImage('images/…'))  →  props.image = logic.New AssetImage
//
// The first two are named constructors that build a provider; the third *is* the provider. So this component
// takes all three and converges them onto one {@link ImageSource} before resolving — rather than three
// components, or a generator that rewrites one spelling into another and makes the emitted code stop looking
// like the Dart it came from (ADR-6).
//
// ## Why `Icon` is here and not in `material.ts`
//
// It paints an asset too. A Material icon is a *glyph in a font*, and the font is a file the application has
// to ship — which makes `Icon` an asset-shipping question wearing a widget's clothes, and puts it next to
// `Image` rather than next to `Divider`. The codepoint reaches it as data because the analyzer folds
// `Icons.star` to `IconData(0xe5f9, fontFamily: 'MaterialIcons')` (ADR-0023): the kit carries no icon table,
// and could not — Flutter's `Icons` has some two thousand entries.

import { createElement, type CSSProperties, type ReactElement } from 'react';

import { ICON_DEFAULTS } from '../generated/material_metadata.js';
import { objectFit, sizeStyle, type BoxFit } from '../layout/constraints.js';
import { useAssetManifest } from '../react/assets.js';
import {
  AssetImage,
  NetworkImage,
  resolveImage,
  type ImageSource,
} from '../assets/image_provider.js';

/** Props for {@link Image}. Flutter's `Image`, in all three of its spellings. */
export interface ImageProps {
  /** The provider — Flutter's `Image(image:)`. Takes precedence over {@link name} and {@link src}. */
  readonly image?: ImageSource;
  /** The asset key — Flutter's `Image.asset(String name)`. */
  readonly name?: string;
  /** The URL — Flutter's `Image.network(String src)`. */
  readonly src?: string;
  /** The width, in logical pixels, or `Infinity` for `double.infinity`. */
  readonly width?: number;
  /** The height, in logical pixels, or `Infinity` for `double.infinity`. */
  readonly height?: number;
  /** How the image fills its box. Defaults to `contain`, as in Flutter. */
  readonly fit?: BoxFit;
  /** Alternative text. Flutter's `semanticLabel`. */
  readonly semanticLabel?: string;
}

/**
 * The single provider a set of `Image` props denotes.
 *
 * Precedence is `image` → `name` → `src`, and it is a precedence rather than an error because the three are
 * mutually exclusive *in Dart* — no `Image` constructor accepts two of them — so a tree carrying two is one
 * the generator built wrong, and the explicit provider is the one to believe.
 */
function sourceOf(props: ImageProps): ImageSource | undefined {
  if (props.image !== undefined) return props.image;
  if (props.name !== undefined) return new AssetImage(props.name);
  if (props.src !== undefined) return new NetworkImage(props.src);
  return undefined;
}

/**
 * Flutter's `Image` — paints an image from an asset, a URL, or bytes.
 *
 * An `<img>`, which is the element that already does what Flutter's `Image` does: decodes a container format,
 * respects an intrinsic size, and lets `object-fit` place it. `BoxFit` maps through
 * {@link objectFit}, whose two inexact members are documented at the table rather than here.
 *
 * `loading="lazy"` and `decoding="async"` are not set. Both are browser behaviours Flutter has no equivalent
 * of, and choosing them for an app that did not ask changes when images appear — a visible difference from
 * the Flutter reference, which is what ADR-12's visual metric would catch.
 *
 * @param props - see {@link ImageProps}.
 * @returns the image.
 * @throws RuntimeError - `BRG4010` if an asset key is not in the manifest.
 */
export function Image(props: ImageProps): ReactElement {
  const manifest = useAssetManifest();
  const source = sourceOf(props);
  // No source is a legal intermediate state only in a tree the generator built wrong; an `<img>` with no
  // `src` renders a broken-image glyph, so it emits nothing at all instead.
  if (source === undefined) return createElement('img', { alt: props.semanticLabel ?? '' });

  const resolved = resolveImage(source, manifest);
  const style: CSSProperties = {
    ...sizeStyle(props.width, props.height),
    objectFit: objectFit(props.fit),
  };
  return createElement('img', {
    src: resolved.src,
    // Flutter's `semanticLabel` is the accessible name and its absence means *decorative*. An empty `alt` is
    // exactly that to a screen reader, where a missing `alt` makes one announce the file name.
    alt: props.semanticLabel ?? '',
    style,
  });
}

/**
 * A Material icon — the runtime form of Flutter's `IconData`.
 *
 * Data, not a name. `Icons.star` is `IconData(0xe5f9, fontFamily: 'MaterialIcons')` in Flutter, and the
 * analyzer folds the reference to that construction (ADR-0023) precisely so the kit does not have to carry
 * two thousand icon names for `Icons.star` to resolve to anything.
 */
export class IconData {
  /** The glyph's codepoint in the icon font. */
  public readonly codePoint: number;
  /** The font that holds the glyph. Defaults to Material's, from the catalog. */
  public readonly fontFamily: string;
  /** The package shipping the font, for an icon set from a dependency. */
  public readonly fontPackage?: string;

  public constructor(options: {
    readonly codePoint: number;
    readonly fontFamily?: string;
    readonly fontPackage?: string;
  }) {
    this.codePoint = options.codePoint;
    this.fontFamily = options.fontFamily ?? String(ICON_DEFAULTS['fontFamily']);
    if (options.fontPackage !== undefined) this.fontPackage = options.fontPackage;
  }
}

/** Props for {@link Icon}. Flutter's `Icon`. */
export interface IconProps {
  /** Which glyph. Flutter's positional `icon` argument, named by the catalog. */
  readonly icon?: IconData;
  /** The glyph's size, in logical pixels. Defaults to the catalog's Material default. */
  readonly size?: number;
  /** The Material role to paint it in. Defaults to inheriting the surrounding text colour. */
  readonly colorRole?: string;
  /** Alternative text. Flutter's `semanticLabel`; absent means decorative. */
  readonly semanticLabel?: string;
}

/**
 * Flutter's `Icon` — one glyph from an icon font.
 *
 * A `<span>` holding the codepoint, styled with the font the `IconData` names. That is what Flutter does too:
 * an icon is a character, and `Icons.star` is the character at `U+E5F9` in the `MaterialIcons` font.
 *
 * **The font is the application's to ship.** A codepoint with no font loaded renders a replacement glyph, so
 * the generated project must serve `MaterialIcons` — the generator emits it into the asset manifest as a
 * required font and reports `BRG3013` when the project declares none. Nothing here can supply it, and
 * silently rendering a box would be the kind of nearly-right output ADR-12 exists to catch.
 *
 * `1` is the line height, and `fontFeatureSettings: 'liga'` enables the ligatures Material's font uses for
 * named icons. Both are what Flutter's own icon rendering does.
 *
 * @param props - see {@link IconProps}.
 * @returns the glyph.
 */
export function Icon(props: IconProps): ReactElement {
  const size = props.size ?? Number(ICON_DEFAULTS['size']);
  const style: CSSProperties = {
    fontFamily: props.icon?.fontFamily ?? String(ICON_DEFAULTS['fontFamily']),
    fontSize: size,
    fontWeight: Number(ICON_DEFAULTS['weight']),
    lineHeight: 1,
    // An icon font is not text: without this, a browser may apply letter-spacing or word-spacing inherited
    // from the surrounding paragraph and shift the glyph off its box.
    letterSpacing: 'normal',
    wordSpacing: 'normal',
    fontStyle: 'normal',
    display: 'inline-block',
    // Flutter's icons are square by construction; stating both keeps a missing glyph from collapsing the box.
    width: size,
    height: size,
    fontFeatureSettings: "'liga'",
    // The glyph, not the surrounding text, is what should not be selected — an icon is not a word.
    userSelect: 'none',
  };
  return createElement(
    'span',
    {
      style,
      // Decorative by default, exactly as `semanticLabel`'s absence means in Flutter: without this a screen
      // reader announces the private-use codepoint as a character.
      'aria-hidden': props.semanticLabel === undefined ? true : undefined,
      'aria-label': props.semanticLabel,
      role: props.semanticLabel === undefined ? undefined : 'img',
    },
    props.icon === undefined ? null : String.fromCodePoint(props.icon.codePoint),
  );
}
