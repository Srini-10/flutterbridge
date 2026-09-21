// `package:dio` on `fetch` — the subset real applications use (ADR-0075).
//
// What is mapped, each measured against real `dio` talking to a real HTTP server (`tests/dio_truth/`): `Dio`, `BaseOptions`, `Options`, `Response`,
// `DioException` and `DioExceptionType`; `get`/`post`/`put`/`patch`/`delete`/`request`; `baseUrl` joining, `queryParameters` (values stringified, lists
// repeated, `null` sent as an empty value), headers (base, then per call), JSON request bodies (a Dart `Map`/`List` is encoded as the JSON it is), JSON responses (decoded into Dart
// `Map`s and `List`s), text responses, `204` → `null`, a non-2xx status → `DioException(badResponse)` carrying the `Response`, a receive timeout
// → `receiveTimeout`, an unreachable server → `connectionError`.
//
// ## Documented differences from dio on a device
//
//  - A browser's `fetch` does not separate connecting from waiting: `receiveTimeout` bounds the whole exchange after the request is sent (which is what a
//    server that never answers looks like to dio too), `connectTimeout` bounds it when no `receiveTimeout` is set, and `sendTimeout` is not enforced.
//  - Cross-origin rules (CORS) apply; a request the browser blocks is a `connectionError`, as an unreachable server is, because `fetch` cannot say which.
//  - No interceptors, `FormData`, `MultipartFile`, download/upload progress, `CancelToken`, or a custom `HttpClientAdapter`: a program using one is refused
//    by the generator (`LogInterceptor` — a logger — is accepted and does nothing).

import { Duration } from '../widgets/animation.js';

/** Why a request failed — `DioExceptionType`. */
export const DioExceptionType = Object.freeze({
  connectionTimeout: 'connectionTimeout',
  sendTimeout: 'sendTimeout',
  receiveTimeout: 'receiveTimeout',
  badCertificate: 'badCertificate',
  badResponse: 'badResponse',
  cancel: 'cancel',
  connectionError: 'connectionError',
  unknown: 'unknown',
});
/** A `DioExceptionType`. */
export type DioExceptionTypeName = (typeof DioExceptionType)[keyof typeof DioExceptionType];

type Millis = Duration | number | null | undefined;
const millis = (value: Millis): number | undefined => (value === null || value === undefined ? undefined : typeof value === 'number' ? value : value.inMilliseconds);

/** Anything a Dart `Map` might arrive as: a `Map`, or a plain object written by hand. */
type Dictionary = ReadonlyMap<unknown, unknown> | Record<string, unknown> | null | undefined;
function entriesOf(value: Dictionary): [string, unknown][] {
  if (value === null || value === undefined) return [];
  return value instanceof Map ? [...value.entries()].map(([k, v]) => [String(k), v]) : Object.entries(value);
}

/** Dart values as JSON: a `Map` is an object, a `Set` an array, and `toJson()` is honoured, as `jsonEncode` does. */
export function dioToJson(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(dioToJson);
  if (value instanceof Set) return [...value].map(dioToJson);
  if (value instanceof Map) return Object.fromEntries([...value.entries()].map(([k, v]) => [String(k), dioToJson(v)]));
  if (typeof value === 'object') {
    const candidate = value as { toJson?: () => unknown };
    if (typeof candidate.toJson === 'function') return dioToJson(candidate.toJson());
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, dioToJson(v)]));
  }
  return value;
}

/** JSON as Dart values: an object becomes a `Map` (Dart's `Map<String, dynamic>`), an array stays a list. */
export function dioFromJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dioFromJson);
  if (value !== null && typeof value === 'object') return new Map(Object.entries(value).map(([k, v]) => [k, dioFromJson(v)]));
  return value;
}

/** Options for a whole `Dio` — `BaseOptions`. */
export interface BaseOptionsInit {
  readonly baseUrl?: string;
  readonly connectTimeout?: Millis;
  readonly receiveTimeout?: Millis;
  readonly sendTimeout?: Millis;
  readonly headers?: Dictionary;
  readonly queryParameters?: Dictionary;
  readonly contentType?: string | null;
}

/** Flutter-side `BaseOptions`. */
export class BaseOptions {
  public readonly baseUrl: string;
  public readonly connectTimeout: number | undefined;
  public readonly receiveTimeout: number | undefined;
  public readonly sendTimeout: number | undefined;
  public readonly headers: Map<string, unknown>;
  public readonly queryParameters: Map<string, unknown>;
  public readonly contentType: string | undefined;

  public constructor(init: BaseOptionsInit = {}) {
    this.baseUrl = init.baseUrl ?? '';
    this.connectTimeout = millis(init.connectTimeout);
    this.receiveTimeout = millis(init.receiveTimeout);
    this.sendTimeout = millis(init.sendTimeout);
    this.headers = new Map(entriesOf(init.headers));
    this.queryParameters = new Map(entriesOf(init.queryParameters));
    this.contentType = init.contentType ?? undefined;
  }
}

/** Per-call options — `Options`. */
export interface OptionsInit {
  readonly method?: string;
  readonly headers?: Dictionary;
  readonly contentType?: string | null;
  readonly receiveTimeout?: Millis;
  readonly sendTimeout?: Millis;
}

/** `Options`. */
export class Options {
  public readonly method: string | undefined;
  public readonly headers: Map<string, unknown> | undefined;
  public readonly contentType: string | undefined;
  public readonly receiveTimeout: number | undefined;
  public readonly sendTimeout: number | undefined;

  public constructor(init: OptionsInit = {}) {
    this.method = init.method;
    this.headers = init.headers === undefined || init.headers === null ? undefined : new Map(entriesOf(init.headers));
    this.contentType = init.contentType ?? undefined;
    this.receiveTimeout = millis(init.receiveTimeout);
    this.sendTimeout = millis(init.sendTimeout);
  }
}

/** What a request asked for, as far as a `Response` or a `DioException` reports it. */
export interface RequestOptions {
  readonly method: string;
  readonly path: string;
  readonly uri: string;
}

/** `Response<T>`. */
export class Response<T = unknown> {
  public constructor(
    public readonly data: T,
    public readonly statusCode: number | null,
    public readonly statusMessage: string | null,
    public readonly requestOptions: RequestOptions,
  ) {}
}

/** `DioException`. Not a Dart `Exception` subtype in the type system's sense, but caught the way one is: `on DioException catch (e)`. */
export class DioException {
  public constructor(
    public readonly type: DioExceptionTypeName,
    public readonly requestOptions: RequestOptions,
    public readonly response: Response | null = null,
    public readonly error: unknown = null,
    public readonly message: string | null = null,
  ) {}

  public toString(): string {
    return `DioException [${this.type}]: ${this.message ?? ''}`;
  }
}

/** `LogInterceptor` — a logger; accepted so `dio.interceptors.add(LogInterceptor(...))` does nothing, as it does in a release build. */
export class LogInterceptor {
  public constructor(_options: object = {}) {
    void _options;
  }
}

function join(baseUrl: string, path: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) return path;
  if (baseUrl === '') return path;
  return baseUrl.replace(/\/+$/, '') + (path.startsWith('/') ? path : `/${path}`);
}

function queryString(parameters: readonly [string, unknown][]): string {
  const parts: string[] = [];
  for (const [key, value] of parameters) {
    // A `null` value is sent as an empty one (`n=`), not omitted — measured against real dio.
    for (const item of Array.isArray(value) ? value : [value]) {
      parts.push(`${encodeURIComponent(key)}=${item === null || item === undefined ? '' : encodeURIComponent(String(item))}`);
    }
  }
  return parts.join('&');
}

/** The HTTP client — `Dio`. */
export class Dio {
  public options: BaseOptions;
  /** Accepts `add(LogInterceptor(...))`; any other interceptor is refused when the program is generated. */
  public readonly interceptors: { add(interceptor: unknown): void } = { add: () => undefined };

  public constructor(options?: BaseOptions) {
    this.options = options ?? new BaseOptions();
  }

  public get<T = unknown>(path: string, init: CallInit = {}): Promise<Response<T>> {
    return this.request<T>(path, { ...init, method: 'GET' });
  }
  public post<T = unknown>(path: string, init: CallInit = {}): Promise<Response<T>> {
    return this.request<T>(path, { ...init, method: 'POST' });
  }
  public put<T = unknown>(path: string, init: CallInit = {}): Promise<Response<T>> {
    return this.request<T>(path, { ...init, method: 'PUT' });
  }
  public patch<T = unknown>(path: string, init: CallInit = {}): Promise<Response<T>> {
    return this.request<T>(path, { ...init, method: 'PATCH' });
  }
  public delete<T = unknown>(path: string, init: CallInit = {}): Promise<Response<T>> {
    return this.request<T>(path, { ...init, method: 'DELETE' });
  }

  /** The general call the verbs share. */
  public async request<T = unknown>(path: string, init: CallInit & { readonly method?: string } = {}): Promise<Response<T>> {
    const options = init.options;
    const method = (options?.method ?? init.method ?? 'GET').toUpperCase();
    const query = queryString([...this.options.queryParameters.entries(), ...entriesOf(init.queryParameters)] as [string, unknown][]);
    const url = join(this.options.baseUrl, path) + (query === '' ? '' : (path.includes('?') ? '&' : '?') + query);
    const requestOptions: RequestOptions = { method, path, uri: url };

    const headers = new Headers();
    for (const [key, value] of [...this.options.headers.entries(), ...(options?.headers?.entries() ?? [])]) headers.set(key, String(value));
    let body: string | undefined;
    if (init.data !== undefined && init.data !== null && method !== 'GET' && method !== 'HEAD') {
      const contentType = options?.contentType ?? this.options.contentType ?? 'application/json';
      if (!headers.has('content-type')) headers.set('content-type', contentType);
      body = typeof init.data === 'string' ? init.data : JSON.stringify(dioToJson(init.data));
    }

    // `fetch` cannot tell connecting from waiting (see this file's header): the receive timeout bounds the exchange, the connect timeout does when it is alone.
    const receive = options?.receiveTimeout ?? this.options.receiveTimeout;
    const connect = this.options.connectTimeout;
    const limit = receive ?? connect;
    const limitType: DioExceptionTypeName = receive !== undefined ? DioExceptionType.receiveTimeout : DioExceptionType.connectionTimeout;
    const controller = new AbortController();
    let timedOut = false;
    const timer = limit === undefined || limit <= 0 ? undefined : setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, limit);

    let response: globalThis.Response;
    try {
      response = await fetch(url, { method, headers, ...(body === undefined ? {} : { body }), signal: controller.signal });
    } catch (error) {
      clearTimeout(timer);
      if (timedOut) throw new DioException(limitType, requestOptions, null, error, `The request took longer than ${String(limit)} ms.`);
      throw new DioException(DioExceptionType.connectionError, requestOptions, null, error, 'The connection errored.');
    }
    let data: unknown;
    try {
      const text = await response.text();
      const type = response.headers.get('content-type') ?? '';
      data = text === '' ? null : type.includes('json') ? dioFromJson(JSON.parse(text)) : text;
    } catch (error) {
      clearTimeout(timer);
      if (timedOut) throw new DioException(limitType, requestOptions, null, error, `The request took longer than ${String(limit)} ms.`);
      throw new DioException(DioExceptionType.unknown, requestOptions, null, error, 'The response could not be read.');
    }
    clearTimeout(timer);
    const result = new Response(data as T, response.status, response.statusText, requestOptions);
    if (response.status < 200 || response.status >= 300) {
      throw new DioException(DioExceptionType.badResponse, requestOptions, result, null, `The request returned an invalid status of ${String(response.status)}.`);
    }
    return result;
  }
}

/** The arguments every verb takes. */
export interface CallInit {
  readonly data?: unknown;
  readonly queryParameters?: Dictionary;
  readonly options?: Options | null;
}
