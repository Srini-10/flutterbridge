// Package adapters the generator does not have — and says so, by package (ADR-0073).
//
// A Flutter application's behaviour is often a package's: state (`riverpod`), HTTP (`dio`), audio, files, storage. Each is a
// *semantic* mapping problem, not a syntax one — `ref.watch(provider)` is a subscription, `dio.get` is a `fetch` with interceptors —
// and a generator that lowered one by guessing would be wrong silently. So a package is in exactly one of three states:
//
//   - **supported** — it has an adapter (`go_router` routes, `gap`, `collection`'s equality, `freezed_annotation`, Material);
//   - **not implemented yet** — a browser equivalent exists and the mapping is unbuilt; every use is refused, naming the package;
//   - **no browser equivalent** — the capability does not exist in a browser at all; every use is refused, saying so.
//
// The two refusals are different promises, which is why the table keeps them apart: the first is a roadmap, the second a boundary.
// This file is the table, and the two sentences every refusal is built from. It never changes what is emitted.

type Node = Record<string, unknown>;

/** What a package is, and why the generator cannot lower it today. */
export interface PackageModel {
  /** The pub package names this entry covers (`package:<name>/…`). */
  readonly packages: readonly string[];
  /** What to call it in a message. */
  readonly label: string;
  /** `not-implemented`: a browser equivalent exists. `no-browser-equivalent`: it does not. */
  readonly status: 'not-implemented' | 'no-browser-equivalent';
  /** What the package does for the application. */
  readonly capability: string;
  /** The browser mechanism a future adapter would use, or why there is none. */
  readonly browser: string;
  /** What a program can do today. */
  readonly workaround?: string;
  /**
   * Set when the package *has* an adapter (`package_kit.ts`) and only these classes do not: a use of anything else in the package is supported, so
   * only these names are refused (`dio`: interceptors, `FormData`, `CancelToken`, …).
   */
  readonly onlyClasses?: readonly string[];
}

const STATE = 'hold the state in a `State` class, or pass it through constructor parameters and callbacks';

/** Packages a real application commonly needs and the generator has no adapter for, by what they are for. */
export const UNSUPPORTED_PACKAGES: readonly PackageModel[] = [
  {
    packages: ['flutter_riverpod', 'riverpod', 'hooks_riverpod', 'riverpod_annotation', 'state_notifier'],
    label: 'Riverpod',
    status: 'not-implemented',
    capability: 'state management: providers, notifiers, `ref.watch`/`read`/`listen`, `ConsumerWidget`',
    browser: 'a signal or store per provider, and a subscription per `ref.watch`',
    workaround: STATE,
  },
  {
    packages: ['dio'],
    label: 'dio (beyond the fetch-backed subset)',
    status: 'not-implemented',
    capability: 'interceptors, `FormData`/`MultipartFile` uploads, `CancelToken`, download, custom adapters — `Dio`, `BaseOptions`, `Options`, `Response` and `DioException` are supported (ADR-0075)',
    browser: '`fetch` with a wrapper for interceptors, `FormData`, and an `AbortController` for cancellation',
    onlyClasses: [
      'Interceptor',
      'InterceptorsWrapper',
      'QueuedInterceptor',
      'QueuedInterceptorsWrapper',
      'FormData',
      'MultipartFile',
      'CancelToken',
      'HttpClientAdapter',
      'ResponseType',
      'Transformer',
      'DioMixin',
      'ProgressCallback',
    ],
  },
  {
    packages: ['http'],
    label: 'http',
    status: 'not-implemented',
    capability: 'an HTTP client',
    browser: '`fetch`',
  },
  {
    packages: ['just_audio', 'audioplayers'],
    label: 'audio playback',
    status: 'not-implemented',
    capability: 'audio playback',
    browser: '`HTMLAudioElement` / the Web Audio API',
  },
  {
    packages: ['record'],
    label: 'audio recording',
    status: 'not-implemented',
    capability: 'microphone recording',
    browser: '`getUserMedia` + `MediaRecorder` (behind a permission prompt)',
  },
  {
    packages: ['file_picker', 'file_picker_platform_interface', 'image_picker'],
    label: 'file picking',
    status: 'not-implemented',
    capability: 'choosing files from the device',
    browser: '`<input type="file">`',
  },
  {
    packages: ['shared_preferences'],
    label: 'shared_preferences',
    status: 'not-implemented',
    capability: 'small persistent key-value storage',
    browser: '`localStorage`',
  },
  {
    packages: ['supabase', 'supabase_flutter', 'gotrue', 'postgrest', 'realtime_client'],
    label: 'Supabase',
    status: 'not-implemented',
    capability: 'a backend client: auth, database queries, realtime',
    browser: 'the `supabase-js` client',
  },
  {
    packages: ['url_launcher'],
    label: 'url_launcher',
    status: 'not-implemented',
    capability: 'opening a URL or another app',
    browser: '`window.open` / `location`',
  },
  {
    packages: ['path_provider'],
    label: 'path_provider',
    status: 'no-browser-equivalent',
    capability: 'the application documents, cache and temporary directories',
    browser: 'a browser has no file system directories the page can name; storage is `localStorage`/IndexedDB/OPFS, a different model',
  },
  {
    packages: ['sqflite', 'drift', 'isar', 'hive'],
    label: 'an on-device database',
    status: 'no-browser-equivalent',
    capability: 'a local database file',
    browser: 'IndexedDB is a different model (no SQL, no file); a rewrite, not a mapping',
  },
  {
    packages: ['permission_handler', 'geolocator', 'local_auth', 'flutter_local_notifications', 'firebase_messaging'],
    label: 'device permissions and native services',
    status: 'no-browser-equivalent',
    capability: 'operating-system permissions and native services',
    browser: 'the corresponding browser APIs are different in kind (a per-site prompt, no background delivery)',
  },
];

/** The package a `TypeRef.library` / `logic.Ref.library` belongs to (`package:dio/src/dio.dart` → `dio`), or `undefined`. */
export function packageNameOf(library: unknown): string | undefined {
  if (typeof library !== 'string' || !library.startsWith('package:')) return undefined;
  return library.slice('package:'.length).split('/')[0];
}

/**
 * The unsupported-package entry for a library URI (and, for a package with an adapter, the class name), if it is one.
 *
 * A package with an adapter is unsupported only for the classes its entry lists, so a `dio` `Response` is fine and a `dio` `CancelToken` is refused.
 */
export function unsupportedPackageOf(library: unknown, className?: unknown): PackageModel | undefined {
  const name = packageNameOf(library);
  if (name === undefined) return undefined;
  const entry = UNSUPPORTED_PACKAGES.find((candidate) => candidate.packages.includes(name));
  if (entry?.onlyClasses === undefined) return entry;
  const bare = typeof className === 'string' ? className.replace(/\?$/, '').split('<')[0] : undefined;
  return bare !== undefined && entry.onlyClasses.includes(bare) ? entry : undefined;
}

/** The sentence a refusal of one use carries: which package, what it is for, and whether a browser equivalent exists. */
export function packageRefusal(model: PackageModel): string {
  return (
    `This uses ${model.label}, which has no adapter: ${model.capability}. ` +
    (model.status === 'not-implemented'
      ? `A browser equivalent exists (${model.browser}) and the mapping is not built yet.`
      : `It has no browser equivalent: ${model.browser}.`)
  );
}

/**
 * One diagnostic per unsupported package the program touches, with the number of typed references it makes.
 *
 * The per-use refusals say *where*; this says *what it is* — the root cause a hundred `BRG3006`s share.
 *
 * @returns each package's summary, sorted, with its reference count.
 */
export function unsupportedPackagesIn(nodes: readonly unknown[]): { model: PackageModel; references: number }[] {
  const counts = new Map<PackageModel, number>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const record = value as Node;
    const model = unsupportedPackageOf(record['library'], record['name']);
    if (model !== undefined) counts.set(model, (counts.get(model) ?? 0) + 1);
    for (const inner of Object.values(record)) walk(inner);
  };
  for (const node of nodes) walk(node);
  return [...counts.entries()]
    .map(([model, references]) => ({ model, references }))
    .sort((a, b) => a.model.label.localeCompare(b.model.label));
}
