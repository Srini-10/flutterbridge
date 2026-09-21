// The exception classes real code throws and catches (`dart:core`, `dart:async`) — M12.
//
// A Dart `Exception` and a Dart `Error` are different things (`on Exception` does not catch a `StateError`), and each prints its own
// way (`FormatException: msg`, `Bad state: msg`). These classes keep both: `DartException` and `DartError` are the two bases, and
// `toString()` is Dart's.

/** The base of `Exception` implementations: not an `Error`. */
export class DartException {
  constructor(readonly message?: unknown) {}
  toString(): string {
    return this.message === undefined || this.message === null ? 'Exception' : `Exception: ${String(this.message)}`;
  }
}

/** The base of `Error` subclasses (`StateError`, `ArgumentError`, …). */
export class DartError {
  toString(): string {
    return 'Error';
  }
}

/** `FormatException(message, source, offset)`. */
export class DartFormatException extends DartException {
  constructor(message: unknown = '', readonly source?: unknown, readonly offset?: number | null) {
    super(message);
  }
  override toString(): string {
    return `FormatException${this.message === '' ? '' : `: ${String(this.message)}`}`;
  }
}

/** `StateError(message)`. */
export class DartStateError extends DartError {
  constructor(readonly message: string) {
    super();
  }
  override toString(): string {
    return `Bad state: ${this.message}`;
  }
}

/** `ArgumentError([message, name])`. */
export class DartArgumentError extends DartError {
  constructor(readonly message: unknown = null, readonly name?: string | null) {
    super();
  }
  override toString(): string {
    const name = this.name === undefined || this.name === null ? '' : ` (${this.name})`;
    return this.message === null || this.message === undefined ? 'Invalid argument(s)' : `Invalid argument(s)${name}: ${String(this.message)}`;
  }
}

/** `RangeError(message)`. */
export class DartRangeError extends DartArgumentError {
  override toString(): string {
    return `RangeError: ${String(this.message)}`;
  }
}

/** `UnsupportedError(message)`. */
export class DartUnsupportedError extends DartError {
  constructor(readonly message: string) {
    super();
  }
  override toString(): string {
    return `Unsupported operation: ${this.message}`;
  }
}

/** `UnimplementedError([message])`. */
export class DartUnimplementedError extends DartError {
  constructor(readonly message: string | null = null) {
    super();
  }
  override toString(): string {
    return this.message === null ? 'UnimplementedError' : `UnimplementedError: ${this.message}`;
  }
}

/** `TimeoutException(message, duration)` (`dart:async`). */
export class DartTimeoutException extends DartException {
  constructor(message: unknown = null, readonly duration: unknown = null) {
    super(message);
  }
  override toString(): string {
    return `TimeoutException${this.duration === null ? '' : ` after ${String(this.duration)}`}${this.message === null ? '' : `: ${String(this.message)}`}`;
  }
}

/**
 * `e is Exception` / `on Exception catch`: anything that is not an `Error` and was thrown as an exception object. A thrown string,
 * number or project object is not an `Exception` in Dart either.
 */
export function isDartException(value: unknown): boolean {
  return value instanceof DartException;
}

/** `e is Error` / `on Error catch`. JavaScript's own `TypeError`/`RangeError` are Dart's `Error`s. */
export function isDartError(value: unknown): boolean {
  return value instanceof DartError || value instanceof TypeError || value instanceof RangeError;
}
