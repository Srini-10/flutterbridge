/// Process exit codes.
///
/// Layer: `util`.
///
/// These are a frozen part of the compiler's contract (Spec §9.1, INV-5, INV-16): CI scripts branch
/// on them, so their meanings may not drift.
library;

/// Exit codes returned by the analyzer process.
///
/// Deliberately an `abstract final class` of constants rather than an enum: these values cross a
/// process boundary as integers, and their numeric identity *is* the contract.
abstract final class ExitCodes {
  /// Analysis succeeded. Output was written.
  static const int ok = 0;

  /// Analysis produced at least one error-severity diagnostic.
  ///
  /// Output is still written: a project with errors in one file is still worth extracting from.
  static const int diagnosticsError = 1;

  /// The compiler failed internally. This is always a bug in the compiler.
  static const int internalError = 2;

  /// The environment is not fit to analyze: no pubspec, no package config, no resolved element
  /// model.
  ///
  /// **No output is written** (INV-5). A missing element model silently degrades extraction into a
  /// pile of opaque nodes rather than failing — the M0-T3 F6 lesson — so refusing is the only safe
  /// behaviour.
  static const int environmentFailure = 3;
}
