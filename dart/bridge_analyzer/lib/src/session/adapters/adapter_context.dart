/// What an adapter is given.
///
/// Layer: `session` (adapters).
///
/// Deliberately thin. An adapter gets the resolved AST, the package it is analyzing, and a way to say
/// *I cannot do this* — and nothing else. It has no emitter, no symbol factory, no builder, and no way
/// to construct a record. That is not an oversight; it is the whole point of ISSUE-16's ruling.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/element/type.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic.dart';
import 'package:meta/meta.dart';

/// A finding an adapter reports back.
///
/// An adapter never throws and never emits a diagnostic itself: it *returns* what it found, and
/// extraction — which owns the sink, the spans and the codes — reports it. Two adapters reporting the
/// same problem in two different voices is exactly the sort of drift a registry is supposed to prevent.
@immutable
final class AdapterFinding {
  /// Creates a finding.
  const AdapterFinding({required this.code, required this.message, required this.at});

  /// The diagnostic code (`BRG13xx`).
  final DiagnosticCode code;

  /// What is wrong.
  final String message;

  /// Where.
  final AstNode at;
}

/// The context an adapter runs in.
final class AdapterContext {
  /// Creates a context for the file at project-relative [path] of package [packageName].
  AdapterContext({required this.packageName, required this.path, required this.unit});

  /// The analyzed package's name.
  final String packageName;

  /// The file, project-relative.
  final String path;

  /// The file being walked.
  ///
  /// Handed in rather than held in a static, so the resolver that reads a wrapper's constructor can do
  /// so without any module-scope state (ADR-15). Convenience is how a compiler acquires state that
  /// differs between two runs.
  final CompilationUnit unit;

  final List<AdapterFinding> _findings = <AdapterFinding>[];

  /// What the adapters found and could not handle, in the order they found it.
  List<AdapterFinding> get findings => List<AdapterFinding>.unmodifiable(_findings);

  /// Records a finding. Adapters never throw (Spec §8).
  void report(DiagnosticCode code, String message, AstNode at) {
    _findings.add(AdapterFinding(code: code, message: message, at: at));
  }

  /// Whether [type], or any of its supertypes, is [name] from a library under [package].
  ///
  /// The one type question every adapter asks, answered once. Asked of the **resolved** supertypes —
  /// never of the name, because a class called `GoRoute` that extends nothing is not one, and a class
  /// called `AppRoute` that extends `GoRoute` is.
  static bool isA(DartType? type, String name, {required String package}) {
    if (type is! InterfaceType) {
      return false;
    }
    if (_matches(type, name, package)) {
      return true;
    }
    return type.allSupertypes.any(
      (InterfaceType supertype) => _matches(supertype, name, package),
    );
  }

  static bool _matches(InterfaceType type, String name, String package) =>
      type.element.name == name && type.element.library.identifier.startsWith(package);
}
