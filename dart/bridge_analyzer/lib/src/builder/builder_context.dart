/// The builder's working state.
///
/// Layer: `builder`.
library;

import 'package:bridge_analyzer/src/builder/id_allocator.dart';
import 'package:bridge_analyzer/src/builder/reference_resolver.dart';
import 'package:bridge_analyzer/src/builder/validation.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic_sink.dart';

/// State threaded through one build.
///
/// Created per build and thrown away with it. There is no global state anywhere in the builder: two
/// builds cannot influence each other, which is what makes concurrent builds and the persistent
/// server (M5) possible without redesign.
final class BuilderContext {
  /// Creates a context.
  BuilderContext({required this.diagnostics, this.allocator = const IdAllocator()})
    : resolver = ReferenceResolver(diagnostics: diagnostics, allocator: allocator);

  /// Where problems with the extractor's output are reported.
  final DiagnosticSink diagnostics;

  /// How ids are computed.
  final IdAllocator allocator;

  /// Symbol -> id.
  final ReferenceResolver resolver;

  /// id -> canonical content, for every node built.
  ///
  /// This is the interning table. Content-addressed ids mean that two textually identical subtrees
  /// *are* the same node, so building one twice must produce the same entry — and if it ever does
  /// not, two different contents have collided on one id, which validation reports as `BRG1203`.
  final Map<String, Map<String, Object?>> interned = <String, Map<String, Object?>>{};

  /// Guards against a raw graph that embeds itself.
  final CycleGuard cycles = CycleGuard();

  /// anchor -> the id of the node that occupies it.
  ///
  /// Anchors are occurrence identity, so unlike ids they must be unique.
  final Map<String, String> anchors = <String, String>{};
}
