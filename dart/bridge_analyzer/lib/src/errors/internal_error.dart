/// The internal error model.
///
/// Layer: `errors` — depends on `util` only.
///
/// Spec §8 draws a hard line, and this file is where it lives:
///
/// * A problem in the **user's** source or configuration is a `Diagnostic`. It is data, it is
///   collected, it is reported, and it never throws.
/// * A problem in the **compiler** — a violated invariant, an impossible state, a stage called out
///   of order — is a [BridgeInternalError]. It throws, and it aborts.
///
/// A compiler that throws on weird-but-valid user input is a compiler with a bug. Weird input gets a
/// diagnostic; only broken *compilers* get exceptions.
library;

import 'package:meta/meta.dart';

/// An internal failure: a bug in the compiler, not a problem with the user's code.
///
/// Never thrown in response to anything the user wrote. If a user can trigger one, that is a defect
/// to be fixed by converting it into a diagnostic.
@immutable
final class BridgeInternalError extends Error {
  /// Creates an internal error identified by [code], describing [message].
  BridgeInternalError(this.code, this.message, {this.context = const <String, String>{}});

  /// A stable, greppable identifier, e.g. `stage.not-implemented`.
  final String code;

  /// What went wrong, addressed to whoever maintains the compiler.
  final String message;

  /// Structured context. Ordered by key when rendered, so two identical failures render identically.
  final Map<String, String> context;

  @override
  String toString() {
    final StringBuffer buffer = StringBuffer('BridgeInternalError [$code]: $message');
    final List<String> keys = context.keys.toList()..sort();
    for (final String key in keys) {
      buffer.write('\n  $key: ${context[key]}');
    }
    buffer.write(
      '\n\nThis is a bug in FlutterBridge, not in the analyzed project. Please report it.',
    );
    return buffer.toString();
  }
}

/// The environment is not fit for analysis, and the analyzer refuses to proceed.
///
/// Distinct from [BridgeInternalError]: nothing is broken in the compiler, and nothing is wrong with
/// the user's *code* — the project simply has not been prepared (no `pub get`, no code generation).
/// Exits with `ExitCodes.environmentFailure` and **writes no output** (INV-5).
@immutable
final class EnvironmentFailure implements Exception {
  /// Creates an environment failure carrying the user-facing [diagnosticCode] and [message], plus a
  /// [remedy] telling the user exactly what to run.
  const EnvironmentFailure({
    required this.diagnosticCode,
    required this.message,
    required this.remedy,
  });

  /// The registered diagnostic code (`BRG01xx`) describing the failure.
  final String diagnosticCode;

  /// What is wrong.
  final String message;

  /// What the user should do about it, as a command they can run.
  final String remedy;

  @override
  String toString() => '[$diagnosticCode] $message\n  $remedy';
}
