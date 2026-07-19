// Image providers — Flutter's `ImageProvider` hierarchy, as the kit's resolution layer.
//
// ## Why providers exist here at all, rather than a `src` string on `Image`
//
// Flutter does not have an image widget with a URL. It has an `Image` widget that takes an
// **`ImageProvider`**, and four providers that answer the same question — *where do the bytes come from* —
// four different ways. `Image.asset(...)` and `Image.network(...)` are named constructors that build a
// provider for you; the provider is the model, and the constructors are sugar over it.
//
// That distinction survives into UIR exactly, which the M4-C analyzer probe confirmed: `Image(image:
// AssetImage('x'))` arrives as a `logic.New` of `AssetImage`, while `Image.asset('x')` arrives as a widget
// whose `name` prop is the path. Both must render the same picture. So the kit models the provider, and the
// `Image` component accepts either — one type, `ImageSource`, that the two spellings converge on.
//
// Collapsing them into a `src: string` would work for the two constructors and lose the general case: a
// `MemoryImage` has no URL, an `AssetImage` needs the asset manifest to find its real path, and a provider
// held in a variable and passed around is ordinary Flutter that no `src` string can express.
//
// ## Resolution, and why it is a pure function
//
// A provider is *data*. Turning it into something the DOM can use is {@link resolveImage}, which is a pure
// function of the provider and the manifest — no fetch, no cache, no `document`, nothing that behaves
// differently on a server. That is what makes an `<img>` render identically under `renderToString` and in
// the browser, which is the property a hydration mismatch is the absence of.
//
// Flutter's own providers do far more than this: they cache by key, resolve a scale against the device pixel
// ratio, and stream bytes through `ImageStream`. The browser already does the caching and the streaming, and
// does them better; what it cannot do is know which file `AssetImage('images/logo.png')` means, which is what
// the manifest answers.

import { RuntimeDiagnosticCode, RuntimeError } from '../diagnostics/codes.js';

/**
 * Where an image's bytes come from — the runtime form of Flutter's `ImageProvider`.
 *
 * A discriminated union rather than a class hierarchy: the kit consumes providers, it never subclasses them,
 * and a union makes {@link resolveImage} total by construction — a new provider is a compile error at every
 * site that has to handle one, which is the property that keeps "unsupported" from silently meaning "blank".
 */
export type ImageSource = AssetImage | ExactAssetImage | NetworkImage | MemoryImage;

/**
 * Flutter's `AssetImage` — an image declared in `pubspec.yaml`'s `assets:` section.
 *
 * The asset *key*, not a URL. Flutter resolves it against the asset bundle, picking a density variant if one
 * exists; here it resolves against the generated manifest, which is the same lookup with the same key.
 */
export class AssetImage {
  /** Distinguishes this provider in {@link ImageSource}. */
  public readonly kind = 'asset' as const;
  /** The asset key, as written in the Dart source — e.g. `images/logo.png`. */
  public readonly assetName: string;
  /** The package the asset lives in, for an asset shipped by a dependency. */
  public readonly package?: string;

  public constructor(assetName: string, options: { readonly package?: string } = {}) {
    this.assetName = assetName;
    if (options.package !== undefined) this.package = options.package;
  }
}

/**
 * Flutter's `ExactAssetImage` — an asset at one explicit density, with no variant selection.
 *
 * The difference from {@link AssetImage} is entirely about *which* file: `AssetImage` asks the bundle for the
 * best variant, `ExactAssetImage` names one. Since the browser serves whatever URL it is given, the two
 * resolve identically here and the distinction survives only in `scale`, which the `Image` component applies
 * to the intrinsic size.
 */
export class ExactAssetImage {
  /** Distinguishes this provider in {@link ImageSource}. */
  public readonly kind = 'exactAsset' as const;
  /** The asset key. */
  public readonly assetName: string;
  /** The image's density. `2.0` means the file is twice its logical size. */
  public readonly scale: number;
  /** The package the asset lives in. */
  public readonly package?: string;

  public constructor(
    assetName: string,
    options: { readonly scale?: number; readonly package?: string } = {},
  ) {
    this.assetName = assetName;
    this.scale = options.scale ?? 1;
    if (options.package !== undefined) this.package = options.package;
  }
}

/** Flutter's `NetworkImage` — an image at a URL. */
export class NetworkImage {
  /** Distinguishes this provider in {@link ImageSource}. */
  public readonly kind = 'network' as const;
  /** The absolute URL. */
  public readonly url: string;
  /** The image's density. */
  public readonly scale: number;

  public constructor(url: string, options: { readonly scale?: number } = {}) {
    this.url = url;
    this.scale = options.scale ?? 1;
  }
}

/**
 * Flutter's `MemoryImage` — an image already in memory, as bytes.
 *
 * The bytes are a `Uint8List` in Dart and a `Uint8Array` here. Resolution turns them into a `data:` URL,
 * which is the only thing an `<img>` can take — and is why the media type has to be sniffed rather than
 * assumed (see {@link resolveImage}).
 */
export class MemoryImage {
  /** Distinguishes this provider in {@link ImageSource}. */
  public readonly kind = 'memory' as const;
  /** The encoded image bytes — a PNG, JPEG, GIF or WebP file, not raw pixels. */
  public readonly bytes: Uint8Array;
  /** The image's density. */
  public readonly scale: number;

  public constructor(bytes: Uint8Array, options: { readonly scale?: number } = {}) {
    this.bytes = bytes;
    this.scale = options.scale ?? 1;
  }
}

/**
 * The asset manifest — asset key → the URL the generated app serves it at.
 *
 * Emitted by the generator from the Flutter project's declared assets, and handed to the kit through
 * `AssetProvider`. It exists because the two naming schemes genuinely differ: Flutter addresses an asset by
 * its path inside the package, a web app serves it from a public directory, and only the build knows the
 * mapping between them.
 */
export interface AssetManifest {
  /** Asset key → served URL. */
  readonly assets: Readonly<Record<string, string>>;
}

/** An empty manifest — what an app with no declared assets has. Frozen; it varies with nothing. */
export const EMPTY_ASSET_MANIFEST: AssetManifest = Object.freeze({ assets: Object.freeze({}) });

/**
 * The first bytes of each container format, and the media type each identifies.
 *
 * A `data:` URL must state its media type, and `MemoryImage` carries only bytes — Flutter never needs the
 * type because its decoder sniffs the same magic numbers. Declaring the wrong one is not cosmetic: a browser
 * handed `image/png` for JPEG bytes renders nothing at all.
 *
 * Ordered longest-prefix-first so a format whose signature extends another's cannot be matched by the
 * shorter one.
 */
const MAGIC: readonly { readonly bytes: readonly number[]; readonly media: string }[] = Object.freeze([
  { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], media: 'image/png' },
  { bytes: [0x47, 0x49, 0x46, 0x38], media: 'image/gif' },
  { bytes: [0xff, 0xd8, 0xff], media: 'image/jpeg' },
  // WebP is a RIFF container: "RIFF" ???? "WEBP". The four size bytes between are not part of the signature.
  { bytes: [0x52, 0x49, 0x46, 0x46], media: 'image/webp' },
]);

function mediaTypeOf(bytes: Uint8Array): string | undefined {
  for (const entry of MAGIC) {
    if (entry.bytes.every((byte, index) => bytes[index] === byte)) return entry.media;
  }
  return undefined;
}

/**
 * Base64 for a byte array, without assuming a browser or a Node global.
 *
 * `btoa` exists in browsers and modern Node; `Buffer` exists only in Node. A kit that reached for either
 * unconditionally would fail in the other environment, and this runs in both — the same request is rendered
 * on the server and hydrated in the browser. Encoding by hand costs a few lines and removes the question.
 */
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64(bytes: Uint8Array): string {
  let out = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]!;
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    const triple = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += BASE64[(triple >> 18) & 63]! + BASE64[(triple >> 12) & 63]!;
    out += b === undefined ? '=' : BASE64[(triple >> 6) & 63]!;
    out += c === undefined ? '=' : BASE64[triple & 63]!;
  }
  return out;
}

/** What an {@link ImageSource} resolves to: a URL an `<img>` can load, and the density to size it at. */
export interface ResolvedImage {
  /** The `src` for an `<img>`. */
  readonly src: string;
  /** The image's density. `2` means the file is twice its logical size. */
  readonly scale: number;
}

/**
 * Resolves an image source against the manifest.
 *
 * Pure and total: same source and manifest in, same result out, on a server and in a browser alike. Nothing
 * here fetches, caches, measures the device pixel ratio, or touches `document` — which is what makes an
 * `<img>` server-render to the same markup it hydrates into.
 *
 * @param source - the provider.
 * @param manifest - the generated asset manifest.
 * @returns the URL and density.
 * @throws RuntimeError - `BRG4010` if an asset key is not in the manifest, or if a `MemoryImage`'s bytes are
 * not a format the browser can display. Both are refusals rather than a blank `<img>`: an image that fails to
 * load looks like a slow network, so a missing asset would be indistinguishable from a working app until
 * somebody looked closely.
 */
export function resolveImage(source: ImageSource, manifest: AssetManifest): ResolvedImage {
  switch (source.kind) {
    case 'network':
      return { src: source.url, scale: source.scale };

    case 'asset':
    case 'exactAsset': {
      // A packaged asset is addressed `packages/<package>/<path>` in Flutter, and the manifest is keyed the
      // same way — so the key is built here rather than by every caller.
      const key =
        source.package === undefined
          ? source.assetName
          : `packages/${source.package}/${source.assetName}`;
      const url = manifest.assets[key];
      if (url === undefined) {
        throw new RuntimeError(
          RuntimeDiagnosticCode.UnknownAsset,
          `no asset '${key}' in the manifest. The generator emits one entry per asset declared in the ` +
            `Flutter project's pubspec; an image referenced but not declared there is a missing file rather ` +
            `than a missing URL, and rendering a broken <img> would look like a slow network`,
          [key],
        );
      }
      return { src: url, scale: source.kind === 'exactAsset' ? source.scale : 1 };
    }

    case 'memory': {
      const media = mediaTypeOf(source.bytes);
      if (media === undefined) {
        throw new RuntimeError(
          RuntimeDiagnosticCode.UnknownAsset,
          `these bytes are not a PNG, JPEG, GIF or WebP. A data: URL must declare its media type, and ` +
            `declaring the wrong one renders nothing at all — so an unrecognised container is refused ` +
            `rather than guessed at`,
        );
      }
      return { src: `data:${media};base64,${base64(source.bytes)}`, scale: source.scale };
    }
  }
}
