/// The stage contract.
///
/// Layer: `pipeline` — the top of the graph. It may depend on every layer below it; nothing depends
/// on it except the public facade.
library;

import 'package:bridge_analyzer/src/diagnostics/diagnostic_sink.dart';
import 'package:bridge_analyzer/src/errors/internal_error.dart';
import 'package:meta/meta.dart';

/// Everything a stage is allowed to reach outside its own input.
///
/// Deliberately small. A stage takes typed input, returns typed output, and reports problems to
/// [diagnostics]. It has no ambient access to the filesystem, the clock, or randomness — the three
/// things that make a compiler nondeterministic (D3).
@immutable
final class StageContext {
  /// Creates a context.
  const StageContext({required this.diagnostics});

  /// Where the stage reports problems with the user's project.
  final DiagnosticSink diagnostics;
}

/// A description of a stage, without the ability to run it.
///
/// Lets callers and tests inspect the pipeline's shape — its order, and which stages this build can
/// actually execute — without holding an executable stage.
@immutable
final class StageDescriptor {
  /// Creates a descriptor.
  const StageDescriptor({
    required this.name,
    required this.owner,
    required this.isImplemented,
  });

  /// The stage's stable name, e.g. `load`.
  final String name;

  /// The milestone that owns this stage's logic, e.g. `M1-T8`.
  final String owner;

  /// Whether this build can execute the stage.
  final bool isImplemented;

  @override
  String toString() => isImplemented ? name : '$name (pending $owner)';
}

/// One stage of the analyzer pipeline: a typed, deterministic transformation.
///
/// Stages are pure with respect to the compiler's state: they take [I], return [O], and may add
/// diagnostics. They never mutate a shared model in place, and they never depend on the order in
/// which some *other* stage happened to run.
abstract base class Stage<I extends Object, O extends Object> {
  /// Creates a stage.
  const Stage();

  /// The stage's stable name. Appears in traces and in [StageDescriptor].
  String get name;

  /// The milestone that owns this stage's logic.
  String get owner;

  /// Whether this build implements the stage.
  ///
  /// A stage whose logic belongs to a later milestone returns `false`, and the pipeline stops at it
  /// rather than fabricating a result. This is the only honest thing a half-built compiler can do:
  /// an empty output is indistinguishable from a successful extraction of an empty project.
  bool get isImplemented;

  /// Runs the stage.
  ///
  /// Only called when [isImplemented] is `true`. Calling it otherwise is a contract violation and
  /// throws [BridgeInternalError] — not because the situation is mysterious, but because the caller
  /// is broken.
  Future<O> execute(I input, StageContext context);

  /// This stage, described.
  StageDescriptor get descriptor =>
      StageDescriptor(name: name, owner: owner, isImplemented: isImplemented);

  /// Thrown by unimplemented stages if they are ever executed.
  @protected
  Never notImplemented() => throw BridgeInternalError(
    'stage.not-implemented',
    'Stage "$name" is not implemented in this build; it is owned by $owner. '
        'The pipeline must check isImplemented before executing a stage.',
    context: <String, String>{'stage': name, 'owner': owner},
  );
}
