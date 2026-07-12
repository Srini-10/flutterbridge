/// The one place a `RawNode` is constructed.
///
/// Layer: `session` (extraction).
///
/// Every extractor builds its records through this object. That is a deliberate choke point, and it
/// exists for the same reason the canonical builder is the only place a UIR node is constructed
/// (M1-T3): an invariant that is enforced in one place is enforced, and an invariant that every
/// extractor is trusted to remember is a suggestion.
///
/// What it guarantees:
///
/// * **Spans are project-relative.** An absolute path in a node makes the output depend on the
///   directory the project was checked out into (D3). That has already bitten us once, in M1-T6.
/// * **A type is what the analyzer said it was**, or it is an honest diagnostic. `InvalidType` never
///   becomes a plausible-looking `dynamic` (INV-4).
/// * **Nothing is dropped.** A construct that cannot be modelled becomes an `Opaque*` node carrying
///   its own source text, never nothing.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/element/element.dart';
import 'package:analyzer/dart/element/nullability_suffix.dart';
import 'package:analyzer/dart/element/type.dart';
import 'package:analyzer/source/line_info.dart';
import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic_sink.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_analyzer/src/model/source_span.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_registry.dart';
import 'package:bridge_analyzer/src/session/extract/symbol_table.dart';

/// Builds and collects raw records for one file.
final class RawNodeEmitter {
  /// Creates an emitter for the file at project-relative [path].
  RawNodeEmitter({
    required this.path,
    required this.packageName,
    required this.lineInfo,
    required this.diagnostics,
    required this.registry,
  }) : symbols = Symbols(path);

  /// The file, project-relative.
  final String path;

  /// The analyzed package's name, so a `package:<self>/…` library can be mapped back to a file.
  final String packageName;

  /// The line map, for turning offsets into spans.
  final LineInfo lineInfo;

  /// Where findings go. Extraction never throws (Spec §8): everything becomes a diagnostic.
  final DiagnosticSink diagnostics;

  /// How declarations in this file are named.
  final Symbols symbols;

  /// The compiler's package knowledge. **This file has none of its own** (ISSUE-16).
  final AdapterRegistry registry;

  final List<RawNode> _records = <RawNode>[];

  /// The top-level records produced, in the order they were emitted.
  List<RawNode> get records => List<RawNode>.unmodifiable(_records);

  /// Emits [node] as a top-level record.
  ///
  /// Top-level means *addressable by the builder*, not *lexically top-level*: a `sig.Signal` declared
  /// on a `State` class is emitted here, because a `ui.Component` refers to it by symbol and the
  /// builder must be able to find it.
  RawNode emit(RawNode node) {
    _records.add(node);
    return node;
  }

  // ── spans ─────────────────────────────────────────────────────────────────────────────────────

  /// The span of [node].
  SourceSpan span(AstNode node) => spanAt(node.offset, node.length);

  /// The span of [length] characters at [offset].
  SourceSpan spanAt(int offset, int length) {
    final CharacterLocation location = lineInfo.getLocation(offset);
    return SourceSpan(
      file: path,
      line: location.lineNumber,
      column: location.columnNumber,
      length: length,
    );
  }

  // ── value objects ─────────────────────────────────────────────────────────────────────────────

  /// A `TypeRef` for [type].
  ///
  /// A `TypeRef` is a value object, not a node, so it is a [RawMap] rather than a [RawChild].
  ///
  /// An `InvalidType` here means the element model is incomplete — which the preflight check (M1-T7)
  /// exists to make impossible. If one arrives anyway, that is a compiler-facing fact and it is
  /// reported: `dynamic` would be a lie the rest of the pipeline could not detect.
  RawValue typeRef(DartType? type, {required AstNode at}) {
    if (type == null || type is InvalidType) {
      report(
        Codes.analyzerInconsistency,
        'The analyzer could not resolve a type here, so extraction cannot record one. This means the '
        'element model is incomplete, which the preflight check should have refused.',
        at,
      );
      return const RawMap(<String, RawValue>{'name': RawLiteral('dynamic')});
    }

    final Element? element = type.element;
    final String? library = element?.library?.identifier;
    return RawMap(<String, RawValue>{
      'name': RawLiteral(type.getDisplayString()),
      if (type.nullabilitySuffix == NullabilitySuffix.question) 'nullable': const RawLiteral(true),
      if (library != null) 'library': RawLiteral(library),
    });
  }

  /// A `WidgetRef` for a widget of [name] constructed from [type].
  RawValue widgetRef(String name, {String? constructorName, DartType? type}) {
    final String? library = type?.element?.library?.identifier;
    return RawMap(<String, RawValue>{
      'name': RawLiteral(name),
      if (constructorName != null) 'constructorName': RawLiteral(constructorName),
      if (library != null) 'library': RawLiteral(library),
      // A widget the application declares is one the compiler *generates*; a framework widget is one
      // it must *map*. C1 turned on this distinction, and got it wrong 18 times by guessing from the
      // name. Here it is not a guess, and it is not ours: the adapters say which libraries are theirs.
      if (library != null) 'userDefined': RawLiteral(!registry.isFrameworkLibrary(library)),
    });
  }

  /// The symbol of the component [type] declares, if this project declares it.
  ///
  /// `null` for a framework widget: `Scaffold` is not a component we emit, and a reference to one
  /// would be a promise nothing keeps.
  String? componentSymbolOf(DartType? type, String name) {
    final String? library = type?.element?.library?.identifier;
    if (library == null) {
      return null;
    }
    return Symbols.componentIn(library, name, packageName: packageName);
  }

  // ── the escape hatches ────────────────────────────────────────────────────────────────────────

  /// An expression the extractor cannot model, preserved verbatim (INV-4).
  RawNode opaqueExpr(Expression node, String reason, {DartType? type}) => RawNode(
    kind: 'logic.OpaqueExpr',
    span: span(node),
    fields: <String, RawValue>{
      'dartSource': RawLiteral(node.toSource()),
      'reason': RawLiteral(reason),
      'type': typeRef(type ?? node.staticType, at: node),
    },
  );

  /// A statement the extractor cannot model, preserved verbatim (INV-4).
  RawNode opaqueStmt(AstNode node, String reason) => RawNode(
    kind: 'logic.OpaqueStmt',
    span: span(node),
    fields: <String, RawValue>{
      'dartSource': RawLiteral(node.toSource()),
      'reason': RawLiteral(reason),
    },
  );

  /// A declaration the extractor cannot model, preserved verbatim (INV-4, Spec v2.2 §A11).
  RawNode opaqueDecl(AstNode node, String reason) => RawNode(
    kind: 'logic.OpaqueDecl',
    span: span(node),
    fields: <String, RawValue>{
      'dartSource': RawLiteral(node.toSource()),
      'reason': RawLiteral(reason),
    },
  );

  /// A widget subtree the extractor cannot model, preserved verbatim (INV-4).
  ///
  /// Takes any [AstNode], not only an [Expression]: a builder body and a collection element are not
  /// expressions, and they can still fail to be modellable. All this needs is a source text and a
  /// span.
  RawNode opaqueUi(AstNode node, String reason, {String? widget, DartType? type}) => RawNode(
    kind: 'ui.Opaque',
    span: span(node),
    fields: <String, RawValue>{
      'dartSource': RawLiteral(node.toSource()),
      'reason': RawLiteral(reason),
      if (widget != null) 'widget': widgetRef(widget, type: type),
    },
  );

  // ── diagnostics ───────────────────────────────────────────────────────────────────────────────

  /// Records a finding about the project. Extraction never throws.
  void report(DiagnosticCode code, String message, AstNode at, {String? hint}) {
    diagnostics.add(Diagnostic(code: code, message: message, span: span(at), hint: hint));
  }
}
