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

import 'dart:collection';

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
    this.localPackageNames = const <String>{},
    this.extractedDependencyFiles = const <String>{},
    this.inheritedClasses = const <String>{},
    String? symbolPath,
  }) : symbols = Symbols(symbolPath ?? path);

  /// The file, project-relative — or, for a file belonging to a local dependency (M8-F), its full
  /// `package:<name>/…` URI.
  final String path;

  /// The analyzed package's own name, so a `package:<self>/…` library can be mapped back to a file.
  final String packageName;

  /// Every local dependency's own package name (M8-F) — a `path:`/workspace dependency whose source
  /// this analysis root includes, per `PackageEntry.isLocal`. Distinct from [packageName]: a reference
  /// into one of these resolves to a real declaration this program also extracted; a reference into
  /// anything else (the Flutter SDK, an ordinary pub dependency) does not, and stays honestly
  /// unresolved (`Symbols.pathOf`).
  final Set<String> localPackageNames;

  /// Every local dependency file this analysis root actually extracted (M8-F), named exactly as
  /// `ProjectInfo.dependencyLibraryFiles` names it — a `package:<name>/…` URI. A local dependency's own
  /// `analyzer.exclude` globs (generated protobuf/drift bindings) mean this is a strict subset of the
  /// package's own files, and a reference into the excluded remainder must stay honestly unresolved
  /// (`Symbols.pathOf`) rather than promise a declaration this program never emitted.
  final Set<String> extractedDependencyFiles;

  /// The classes some class in the program extends or mixes in (`inheritance.dart`): each is emitted as a class.
  final Set<String> inheritedClasses;

  /// The functions being inlined into a render tree right now (M12, ADR-0062): a helper that reaches itself is not inlined again.
  final Set<Element> inlining = HashSet<Element>.identity();

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
  ///
  /// [includeExternalTypeArguments]: also carry [type]'s own type arguments when *[type] itself* is
  /// external (no `target` of its own) — `false` everywhere but one caller. `$DtoCopyWith<Dto>`, the
  /// ordinary case this field defaults `false` for, is a *project* generic wrapping another type, and
  /// `typeArguments` has always been populated only there (`shared.json`'s own doc on the field): adding it
  /// to *every* `InterfaceType` regardless — `List<int>`, `Future<String>`, `Response<T>` — would swell
  /// every existing document with data the generator's own `typeArgumentsOf`-text-parsing fallback (kit/SDK
  /// generics) never reads, for no gain and a broad, unrelated golden-fixture diff.
  ///
  /// But an *external* generic container wrapping a *project* type — `StateNotifier<LoadState>`, a class's
  /// own superclass; `FutureProvider<Session>`, a top-level or `static` field's own declared type — needs
  /// exactly this the other way around: the outer type (`StateNotifier`/`FutureProvider`) is external, so
  /// `_classTypeTarget` finds it no `target`, and this function's argument recursion — gated on that target's
  /// presence — never runs, leaving `LoadState`'s/`Session`'s own `target` unrecorded even though each *is*
  /// one this compiler extracts a declaration for. `dart_classes.ts`'s own generic-argument reuse of a
  /// kit-provided superclass's type text, and `functions.ts`'s own field-declaration type-annotation emission
  /// (`docs/m14/riverpod-usage-matrix.md`) both need that `target` to resolve `LoadState`/`Session` to its
  /// own emitted name — the display-name text `typeArgumentsOf` alone re-parses carries no such link. Three
  /// callers opt in for exactly this reason: `_class`'s own `superclass` field, and both of
  /// `declaration_extractor.dart`'s own field-declaration sites (top-level and class-member/`static`).
  RawValue typeRef(DartType? type, {required AstNode at, bool includeExternalTypeArguments = false}) {
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
    final String? target = _classTypeTarget(type, element);
    return RawMap(<String, RawValue>{
      'name': RawLiteral(type.getDisplayString()),
      if (type.nullabilitySuffix == NullabilitySuffix.question) 'nullable': const RawLiteral(true),
      if (library != null) 'library': RawLiteral(library),
      if (target != null) 'target': RawRef(target),
      // `$DtoCopyWith<Dto>`: a project generic type keeps its arguments, so the emitted TypeScript says `$DtoCopyWith<Dto>`.
      // `includeExternalTypeArguments`: the one caller that needs the identical thing when [type] itself has no `target`
      // of its own — see this parameter's own doc, just above.
      // The flag propagates to each argument's own recursive call, not only the outermost one:
      // `FutureProvider<List<Session>?>` needs `Session`'s own `target` captured two levels down — `List` is
      // itself external (no `target` of its own), so without propagation the *inner* call defaults back to
      // `false` and `Session`'s own `target` is lost exactly the way the outer one was before this parameter
      // existed. Confirmed directly: `FutureProvider<unknown[] | null>` instead of
      // `FutureProvider<Session[] | null>` until this line also threaded the flag through.
      if ((target != null || includeExternalTypeArguments) && type is InterfaceType && type.typeArguments.isNotEmpty)
        'typeArguments': RawList(<RawValue>[
          for (final DartType argument in type.typeArguments)
            typeRef(argument, at: at, includeExternalTypeArguments: includeExternalTypeArguments),
        ]),
    });
  }

  /// The `logic.ClassDecl` symbol [type] refers to, when it is a plain class this compiler extracts a
  /// declaration for (ADR-0034) — declaration provenance only, mirroring [componentSymbolOf]'s own
  /// resolved-element approach exactly, never a claim that the referenced class can be constructed or
  /// that its members can be read (that boundary is downstream — the generator's own emittable-subset
  /// decision, and, independently, M9-J's own refusal, which this ADR requires to key on `target`'s mere
  /// presence rather than on whatever name the generator chooses to render for it).
  ///
  /// Absent (`null`) for: a non-class type (primitive, function type, etc. — `element is! ClassElement`);
  /// a generic instantiation (`type.typeArguments.isNotEmpty` — `Box<int>`, `List<Model>` alike; ADR-0034
  /// §12 bounds generics out here, once, rather than in the generator); a component/`State`/store class
  /// (already correctly represented through an entirely different mechanism — `ui.Component`/`app.Store`
  /// — attaching a second, competing identity here would be exactly the kind of duplicate representation
  /// M9-L's own component/store exclusions were written to avoid); or an unresolvable library (external
  /// package with no adapter, or a dependency this analysis root did not itself extract).
  String? _classTypeTarget(DartType type, Element? element) {
    // An enhanced enum is a class in the output (M12, ADR-0056): its type names its declaration like a class's does.
    if (element is EnumElement && isEnhancedEnum(element)) {
      return Symbols.typeIn(
        element.library.identifier,
        element.name ?? '',
        packageName: packageName,
        localPackages: localPackageNames,
        extractedDependencyFiles: extractedDependencyFiles,
      );
    }
    // A mixin names its declaration too (M12, ADR-0059): `with _$Dto` and `x is _$Dto`.
    if (element == null || (element is! ClassElement && element is! MixinElement)) {
      return null;
    }
    if (registry.isComponentBase(type) || registry.isStateBase(type) || registry.isStoreBase(type)) {
      return null;
    }
    final String? library = element.library?.identifier;
    if (library == null) {
      return null;
    }
    return Symbols.typeIn(
      library,
      element.name ?? '',
      packageName: packageName,
      localPackages: localPackageNames,
      extractedDependencyFiles: extractedDependencyFiles,
    );
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
      // ADR-0047: a project-declared widget's own `ui.Component`, by declaration-tier identity —
      // the same `componentSymbolOf` mechanism `route_extractor.dart`/`transition_extractor.dart`
      // already use for `app.Route`/`app.RouteTransition` component targets, applied here so a
      // *composed* reference resolves the same way a *routed* one already does. `null` for a
      // framework widget, unchanged.
      if (componentSymbolOf(type, name) case final String symbol) 'target': RawRef(symbol),
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
    return Symbols.componentIn(
      library,
      name,
      packageName: packageName,
      localPackages: localPackageNames,
      extractedDependencyFiles: extractedDependencyFiles,
    );
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

/// Whether [element] is an *enhanced* enum: it declares a field, a method, a getter, or a constructor of its own (M12, ADR-0056).
/// Such an enum is emitted as a class; a plain one is its value names.
bool isEnhancedEnum(EnumElement element) =>
    element.fields.any((FieldElement f) => f.isOriginDeclaration && !f.isEnumConstant && !f.isStatic) ||
    element.methods.any((MethodElement m) => m.isOriginDeclaration) ||
    element.getters.any((GetterElement g) => g.isOriginDeclaration) ||
    element.constructors.any((ConstructorElement c) => c.isOriginDeclaration);
