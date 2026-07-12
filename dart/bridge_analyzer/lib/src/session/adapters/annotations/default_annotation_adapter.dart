/// Annotations.
///
/// Layer: `session` (adapters).
///
/// Annotations are the one place Dart lets a developer state something the type system cannot, and a
/// compiler that ignores them throws away intent that was given explicitly.
///
/// The analyzer's `Annotation` node never leaves this file: what comes out is an
/// [AnnotationRecognition], which is plain data. That is the quarantine (ADR-14) holding at the adapter
/// boundary as well as at the layer boundary.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_context.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_result.dart';

/// Understands the annotations the compiler reasons about.
final class DefaultAnnotationAdapter implements AnnotationAdapter {
  /// Creates the adapter.
  const DefaultAnnotationAdapter();

  @override
  String get name => 'annotations';

  @override
  int get priority => 50;

  @override
  Set<String> get packages => const <String>{'package:meta/', 'dart:core'};

  @override
  Set<String> get symbols => const <String>{};

  /// Annotations meaning *a code generator completes this declaration*.
  ///
  /// The compiler does not run them — preflight already refused a project whose generated code is
  /// missing (BRG0106) — but it must know that such a class is a generator's *input*, and therefore
  /// data, never a component.
  static const Set<String> codeGenerated = <String>{
    'freezed',
    'Freezed',
    'JsonSerializable',
    'JsonEnum',
    'riverpod',
    'Riverpod',
  };

  @override
  Set<String> get annotations => <String>{
    ...codeGenerated,
    'immutable',
    'Deprecated',
    'deprecated',
    'Generated',
  };

  @override
  AnnotationRecognition? recognise(AdapterContext context, Annotation annotation) {
    final String name = annotation.name.name;
    if (!annotations.contains(name)) {
      return null;
    }
    return AnnotationRecognition(
      name: name,
      isCodeGenerated: codeGenerated.contains(name),
      isDeprecated: name == 'Deprecated' || name == 'deprecated',
      isImmutable: name == 'immutable',
    );
  }
}
