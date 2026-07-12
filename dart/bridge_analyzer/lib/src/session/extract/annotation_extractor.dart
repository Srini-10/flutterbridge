/// Annotations.
///
/// Layer: `session` (extraction).
///
/// **This file contains no package knowledge.** Which annotations mean something, and what they mean,
/// is the adapters' business (ISSUE-16).
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_context.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_registry.dart';

/// Reads annotations, through the registry.
final class AnnotationExtractor {
  /// Creates an extractor.
  const AnnotationExtractor(this.registry, this.context);

  /// The compiler's package knowledge.
  final AdapterRegistry registry;

  /// What the adapters run in.
  final AdapterContext context;

  /// Whether a code generator is expected to complete [node].
  ///
  /// Such a class is a generator's *input*: it is data, never a component. Extraction does not run the
  /// generator — preflight already refused a project whose generated code is missing (BRG0106) — but it
  /// must know what it is looking at.
  bool isCodeGenerated(AnnotatedNode node) => node.metadata.any(
    (Annotation annotation) =>
        registry.recogniseAnnotation(context, annotation)?.isCodeGenerated ?? false,
  );

  /// The accessibility a widget's own arguments state, as a `SemanticsInfo` field value.
  ///
  /// Absent and empty say different things: a `semantics: {}` on every component would be noise in
  /// every diff, so nothing is emitted when nothing was stated.
  RawValue? semanticsOf(String widget, ArgumentList arguments) {
    final Map<String, Object?> constants = <String, Object?>{};
    for (final Argument argument in arguments.arguments) {
      if (argument is! NamedArgument) {
        continue;
      }
      final Object? value = _constantOf(argument.argumentExpression);
      if (value != null) {
        constants[argument.name.lexeme] = value;
      }
    }

    final Map<String, Object?> semantics = registry.semanticsOf(widget, constants);
    if (semantics.isEmpty) {
      return null;
    }
    return RawMap(<String, RawValue>{
      for (final MapEntry<String, Object?> entry in semantics.entries)
        entry.key: RawLiteral(entry.value),
    });
  }

  static Object? _constantOf(Expression node) => switch (node) {
    SimpleStringLiteral() => node.value,
    BooleanLiteral() => node.value,
    _ => null,
  };
}
