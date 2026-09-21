// `AsyncValue` — Riverpod's loading / data / error value, with the behaviours applications depend on.
//
// Every rule here was **recorded from the real `riverpod` 2.6.1** (`fixtures/riverpod_oracle`), not written from memory of its
// documentation, and `tests/riverpod_oracle.test.ts` replays those recordings. The ones a reader would not guess:
//
// - A refresh is a *loading value that still carries the previous value*: `hasValue` stays true, `isRefreshing` is true.
// - An error after data keeps the data: `hasError` and `hasValue` are both true. `valueOrNull` therefore keeps answering.
// - `when` **skips the loading branch on a refresh** by default and calls `data` (or `error`) with what it still has; the
//   loading branch is reached only on the first load, or with `skipLoadingOnRefresh: false`.
// - `whenData` on an error drops the value it does not map: the result has an error and no value.

import { dartRecordEquals } from '../core/dart_core.js';

/** What a `when`/`maybeWhen` call skips. */
export interface WhenOptions {
  /** A refresh (loading that carries a previous value) calls `data`/`error` instead of `loading`. Default `true`. */
  readonly skipLoadingOnRefresh?: boolean;
  /** A reload (loading over a previous value, not started by an invalidate/refresh) does the same. Default `false`. */
  readonly skipLoadingOnReload?: boolean;
  /** An error that still has a previous value calls `data` instead of `error`. Default `false`. */
  readonly skipError?: boolean;
}

type Kind = 'data' | 'loading' | 'error';

interface Parts<T> {
  readonly kind: Kind;
  readonly hasValue: boolean;
  readonly value?: T;
  readonly hasError: boolean;
  readonly error?: unknown;
  readonly stackTrace?: unknown;
  /** A loading value started by an invalidate/refresh. */
  readonly refresh: boolean;
}

/** `==` for two payloads: identity, then the value's own `$eq`, then structural for a record. */
function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  const eq = (a as { $eq?: (o: unknown) => boolean } | null | undefined)?.$eq;
  if (typeof eq === 'function') return eq.call(a, b);
  return dartRecordEquals(a, b);
}

/** The state of an asynchronous computation: loading, data or error — and what it still holds from before. */
export class AsyncValue<T> {
  private constructor(private readonly parts: Parts<T>) {}

  /** `AsyncValue.data(value)`. */
  static data<T>(value: T): AsyncValue<T> {
    return new AsyncValue({ kind: 'data', hasValue: true, value, hasError: false, refresh: false });
  }

  /** `AsyncValue.loading()` — with no previous value. */
  static loading<T>(): AsyncValue<T> {
    return new AsyncValue({ kind: 'loading', hasValue: false, hasError: false, refresh: false });
  }

  /** `AsyncValue.error(error, stackTrace)`. */
  static error<T>(error: unknown, stackTrace?: unknown): AsyncValue<T> {
    return new AsyncValue({ kind: 'error', hasValue: false, hasError: true, error, stackTrace, refresh: false });
  }

  /**
   * The loading value for a re-run: keeps `previous`'s value and error, and is marked as a refresh when the re-run was an
   * invalidate or a refresh (`ref.invalidate`, `ref.refresh`) — which is every re-run this runtime starts.
   */
  static loadingFrom<T>(previous: AsyncValue<T>, isRefresh = true): AsyncValue<T> {
    const p = previous.parts;
    return new AsyncValue({
      kind: 'loading',
      hasValue: p.hasValue,
      ...(p.hasValue ? { value: p.value as T } : {}),
      hasError: p.hasError,
      ...(p.hasError ? { error: p.error, stackTrace: p.stackTrace } : {}),
      refresh: isRefresh && (p.hasValue || p.hasError),
    });
  }

  /** An error that keeps the value `previous` had. */
  static errorFrom<T>(previous: AsyncValue<T>, error: unknown, stackTrace?: unknown): AsyncValue<T> {
    const p = previous.parts;
    return new AsyncValue({
      kind: 'error',
      hasValue: p.hasValue,
      ...(p.hasValue ? { value: p.value as T } : {}),
      hasError: true,
      error,
      stackTrace,
      refresh: false,
    });
  }

  get isLoading(): boolean {
    return this.parts.kind === 'loading';
  }
  get hasValue(): boolean {
    return this.parts.hasValue;
  }
  get hasError(): boolean {
    return this.parts.hasError;
  }
  /** A loading value that started from an invalidate or a refresh and still has something to show. */
  get isRefreshing(): boolean {
    return this.isLoading && this.parts.refresh && (this.parts.hasValue || this.parts.hasError);
  }
  /** A loading value over a previous one that an invalidate/refresh did not start. */
  get isReloading(): boolean {
    return this.isLoading && !this.parts.refresh && (this.parts.hasValue || this.parts.hasError);
  }
  /** The value, or `null` when there is none (`valueOrNull`). */
  get valueOrNull(): T | null {
    return this.parts.hasValue ? (this.parts.value as T) : null;
  }
  /** `value` — the value, or `null` (Riverpod 2's `value` getter rethrows an error only when there is no value). */
  get value(): T | null {
    return this.valueOrNull;
  }
  /** `requireValue` — throws when there is no value. */
  get requireValue(): T {
    if (this.parts.hasValue) return this.parts.value as T;
    if (this.parts.hasError) throw this.parts.error;
    throw new Error('Bad state: Tried to call `requireValue` on an `AsyncValue` that has no value: loading');
  }
  get error(): unknown {
    return this.parts.error ?? null;
  }
  get stackTrace(): unknown {
    return this.parts.stackTrace ?? null;
  }

  /** `when` — exactly one callback runs. */
  when<R>(cases: { data: (value: T) => R; error: (error: unknown, stackTrace: unknown) => R; loading: () => R } & WhenOptions): R {
    return this.match(cases, cases.data, cases.error, cases.loading);
  }

  /** `maybeWhen` — a missing callback falls to `orElse`. */
  maybeWhen<R>(
    cases: {
      data?: (value: T) => R;
      error?: (error: unknown, stackTrace: unknown) => R;
      loading?: () => R;
      orElse: () => R;
    } & WhenOptions,
  ): R {
    return this.match(
      cases,
      cases.data ?? (() => cases.orElse()),
      cases.error ?? (() => cases.orElse()),
      cases.loading ?? (() => cases.orElse()),
    );
  }

  /** `whenData` — maps the value; an error loses the value it does not map. */
  whenData<R>(convert: (value: T) => R): AsyncValue<R> {
    const p = this.parts;
    if (p.kind === 'data') return AsyncValue.data(convert(p.value as T));
    if (p.kind === 'error') return AsyncValue.error<R>(p.error, p.stackTrace);
    // Loading. Recorded: a loading value over *data* keeps the mapped value; one over an *error* keeps the error and loses the
    // value, exactly as an error does.
    if (p.hasError) {
      return new AsyncValue<R>({ kind: 'loading', hasValue: false, hasError: true, error: p.error, stackTrace: p.stackTrace, refresh: p.refresh });
    }
    if (p.hasValue) {
      return new AsyncValue<R>({ kind: 'loading', hasValue: true, value: convert(p.value as T), hasError: false, refresh: p.refresh });
    }
    return AsyncValue.loading<R>();
  }

  /** `==` — the same state, the same value and the same error. */
  $eq(other: unknown): boolean {
    if (!(other instanceof AsyncValue)) return false;
    const a = this.parts;
    const b = other.parts;
    return (
      a.kind === b.kind &&
      a.hasValue === b.hasValue &&
      a.hasError === b.hasError &&
      a.refresh === b.refresh &&
      (!a.hasValue || same(a.value, b.value)) &&
      (!a.hasError || (same(a.error, b.error) && same(a.stackTrace, b.stackTrace)))
    );
  }

  toString(): string {
    const p = this.parts;
    return `Async${p.kind[0]!.toUpperCase()}${p.kind.slice(1)}(${p.hasValue ? `value: ${String(p.value)}` : ''}${p.hasError ? ` error: ${String(p.error)}` : ''})`;
  }

  private match<R>(
    options: WhenOptions,
    data: (value: T) => R,
    error: (error: unknown, stackTrace: unknown) => R,
    loading: () => R,
  ): R {
    const p = this.parts;
    if (this.isLoading) {
      const skip = this.isRefreshing
        ? (options.skipLoadingOnRefresh ?? true)
        : this.isReloading
          ? (options.skipLoadingOnReload ?? false)
          : false;
      if (!skip) return loading();
    }
    if (p.hasError && (!p.hasValue || !(options.skipError ?? false))) return error(p.error, p.stackTrace);
    if (p.hasValue) return data(p.value as T);
    return loading();
  }
}
