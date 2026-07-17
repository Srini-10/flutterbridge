// Runtime diagnostics — the BRG4xxx range.
//
// ## Why the kit has diagnostics at all
//
// The compiler's diagnostics describe a defect in the *user's program*, found while reading it. These
// describe a defect found while *running* it: a cyclic getter, a graph that never settles. They are the
// same kind of statement — "your program says something impossible, here is where" — made at a different
// time, so they get a code, a message and an anchor rather than a bare `Error`.
//
// ## The range
//
// `BRG13xx` is extraction (analyzer), `BRG23xx` is normalization (compiler). Neither uses `BRG4xxx`, so
// ADR-20 claims it for the runtime. Reusing a compiler code would make a runtime failure indistinguishable
// from a compile-time one in any log that carries only the code.

/** A diagnostic code owned by the runtime kit (ADR-20). */
export const RuntimeDiagnosticCode = {
  /** A flush did not reach a fixed point within the iteration bound (ADR-20 R7). */
  FlushDidNotSettle: 'BRG4001',
  /** A `derived` computation reads itself, transitively (ADR-20 R8). */
  CyclicDerived: 'BRG4002',
  /** A store was used after `dispose()`. */
  StoreDisposed: 'BRG4003',
  /** A route was named that the route table does not contain. */
  UnknownRoute: 'BRG4004',
  /** A hook was called outside the provider that supplies its value. */
  MissingProvider: 'BRG4005',
  /** A token was read that the theme does not define. */
  UnknownToken: 'BRG4006',
  /** A colour token's value is not a form the runtime can parse. */
  InvalidColor: 'BRG4007',
} as const;

/** A diagnostic code owned by the runtime kit (ADR-20). */
export type RuntimeDiagnosticCode =
  (typeof RuntimeDiagnosticCode)[keyof typeof RuntimeDiagnosticCode];

/**
 * A defect detected while running a generated application.
 *
 * Carries its `code` as a field rather than only in the message, so a host can route on it without
 * parsing prose — and so the message stays free to change without breaking that routing.
 */
export class RuntimeError extends Error {
  /** The diagnostic code, e.g. `BRG4001`. */
  public readonly code: RuntimeDiagnosticCode;

  /**
   * The nodes involved, in the order they were found — a cycle's path, or the effects still
   * scheduled when a flush gave up. Empty when the defect has no meaningful path.
   */
  public readonly path: readonly string[];

  public constructor(code: RuntimeDiagnosticCode, message: string, path: readonly string[] = []) {
    super(`${code}: ${message}`);
    this.name = 'RuntimeError';
    this.code = code;
    this.path = path;
  }
}
