/// The diagnostic code registry.
///
/// Layer: `diagnostics`.
///
/// Spec §9.2: every code is registered here, exactly once, with a category, a default severity, a
/// docs slug, a title and an explanation. Registering the same id twice is a [BridgeInternalError] —
/// a duplicate code is a silent meaning collision, and it must fail at startup rather than confuse a
/// user later.
///
/// **Codes are permanent.** A developer searching for `BRG1201` in five years must find the same
/// meaning they find today. A code is never reused for a different problem and never renumbered.
///
/// **Only codes the compiler can actually emit are registered.** A registry full of codes nothing
/// emits is a lie about what the compiler does.
library;

import 'package:bridge_analyzer/src/diagnostics/diagnostic.dart';
import 'package:bridge_analyzer/src/errors/internal_error.dart';
import 'package:collection/collection.dart';

/// All codes the analyzer can emit, iterated in ascending id order.
abstract final class Codes {
  // ── BRG01xx — configuration and environment ───────────────────────────────────────────────────

  /// The project has no `pubspec.yaml`; it is not a Dart package.
  static const DiagnosticCode noPubspec = DiagnosticCode(
    id: 'BRG0101',
    category: DiagnosticCategory.configuration,
    defaultSeverity: Severity.error,
    docsSlug: 'no-pubspec',
    title: 'Not a Dart package',
    explanation:
        'The directory the analyzer was pointed at has no pubspec.yaml, so it is not a Dart '
        'package.\n'
        '\n'
        'Point --project at the directory that contains pubspec.yaml. For a Flutter application '
        'that is the application root, not lib/.',
  );

  /// No `package_config.json` was found for the project, nor at any parent workspace root.
  static const DiagnosticCode noPackageConfig = DiagnosticCode(
    id: 'BRG0102',
    category: DiagnosticCategory.configuration,
    defaultSeverity: Severity.error,
    docsSlug: 'no-package-config',
    title: 'Dependencies have not been fetched',
    explanation:
        'The project has no .dart_tool/package_config.json, so its dependencies have never been '
        'resolved.\n'
        '\n'
        'Run `flutter pub get` in the project, then run the analyzer again.\n'
        '\n'
        'The analyzer refuses to continue rather than pressing on. Without a package config every '
        'Flutter type resolves to InvalidType — and the analyzer still returns a resolved AST, just '
        'one in which nothing is what it claims to be. Extraction would produce a confident-looking '
        'tree of opaque nodes instead of failing. Refusing is the only safe behaviour.\n'
        '\n'
        'In a Dart pub workspace the package config lives at the workspace root, not in the member '
        'package. The analyzer looks there too.',
  );

  /// The project has no `lib/` directory, so there is nothing to extract.
  static const DiagnosticCode noLibraryDirectory = DiagnosticCode(
    id: 'BRG0103',
    category: DiagnosticCategory.configuration,
    defaultSeverity: Severity.error,
    docsSlug: 'no-library-directory',
    title: 'Nothing to analyze',
    explanation:
        'The package has no lib/ directory, so it contains no libraries to extract from.\n'
        '\n'
        'Point --project at a Flutter application package.',
  );

  /// pubspec.yaml exists but cannot be understood.
  static const DiagnosticCode malformedPubspec = DiagnosticCode(
    id: 'BRG0104',
    category: DiagnosticCategory.configuration,
    defaultSeverity: Severity.error,
    docsSlug: 'malformed-pubspec',
    title: 'pubspec.yaml cannot be read',
    explanation:
        'The project has a pubspec.yaml, but it is not valid YAML, or it declares no package name.\n'
        '\n'
        'Every later decision depends on it — which package this is, whether it is a Flutter '
        'project, which imports are internal — so the analyzer will not guess at a pubspec it '
        'cannot parse.',
  );

  /// The project is a plain Dart package: it has no `flutter` dependency.
  static const DiagnosticCode notAFlutterProject = DiagnosticCode(
    id: 'BRG0105',
    category: DiagnosticCategory.configuration,
    defaultSeverity: Severity.warning,
    docsSlug: 'not-a-flutter-project',
    title: 'Not a Flutter package',
    explanation:
        'The project does not depend on the flutter SDK, so it is a plain Dart package.\n'
        '\n'
        'It can still be analyzed, and this is a warning rather than an error for that reason. But '
        'it contains no widgets, so extraction will find nothing to convert.\n'
        '\n'
        'If you meant to point at a Flutter application, check --project.',
  );

  /// An import points at nothing. The element model would be incomplete.
  static const DiagnosticCode unresolvedImport = DiagnosticCode(
    id: 'BRG0106',
    category: DiagnosticCategory.configuration,
    defaultSeverity: Severity.error,
    docsSlug: 'unresolved-import',
    title: 'Import points at nothing',
    explanation:
        'A directive in the project does not resolve to any file.\n'
        '\n'
        'The analyzer refuses to continue, and this is the most important refusal it makes. '
        'package:analyzer does NOT fail here: it returns a resolved unit in which every type it '
        'could not find is InvalidType. Extraction would see types it does not recognise and produce '
        'a confident-looking tree of opaque nodes — a silent, total loss of fidelity, with no error '
        'anywhere. It has cost us a day, three times.\n'
        '\n'
        'The causes, in order of likelihood:\n'
        '\n'
        '  * Dependencies have not been fetched. Run `flutter pub get`.\n'
        '  * Generated code has not been generated. A project using freezed, json_serializable or '
        "anything else built on build_runner is full of `part 'x.g.dart';` directives that dangle "
        'until `dart run build_runner build` has run.\n'
        '  * Localizations have not been generated. Run `flutter gen-l10n`.\n'
        '  * The import is simply wrong.\n'
        '\n'
        'The diagnostic says which of these applies, and names the command.',
  );

  // ── BRG13xx — extraction ──────────────────────────────────────────────────────────────────────

  /// A widget the compiler does not know how to map.
  static const DiagnosticCode unknownWidget = DiagnosticCode(
    id: 'BRG1301',
    category: DiagnosticCategory.extraction,
    defaultSeverity: Severity.warning,
    docsSlug: 'unknown-widget',
    title: 'Widget is not in the catalog',
    explanation:
        'A framework or third-party widget was used that the compiler has no mapping for.\n'
        '\n'
        'It is not dropped: it is preserved as a ui.Opaque node carrying its original Dart source, so '
        'nothing is lost and an override or a package adapter can supply the mapping later (INV-4).\n'
        '\n'
        'This is a warning, not an error. C1 found that not one unknown construct in two real '
        'applications was genuinely unconvertible — the gap is catalog breadth, and a project full of '
        'them still compiles.',
  );

  /// A Dart construct the extractor has no UIR node for.
  static const DiagnosticCode unsupportedSyntax = DiagnosticCode(
    id: 'BRG1302',
    category: DiagnosticCategory.extraction,
    defaultSeverity: Severity.warning,
    docsSlug: 'unsupported-syntax',
    title: 'Syntax has no UIR representation',
    explanation:
        'A Dart construct was used that the UIR has no node for — a cascade, a spread, a record, a '
        'pattern, a switch expression.\n'
        '\n'
        'It is preserved as an Opaque node carrying its source text rather than dropped (INV-4). '
        'Downstream passes will not be able to reason about it, and a generator will need an override '
        'or a later milestone to model it.',
  );

  /// The analyzer produced something extraction cannot trust.
  static const DiagnosticCode analyzerInconsistency = DiagnosticCode(
    id: 'BRG1303',
    category: DiagnosticCategory.extraction,
    defaultSeverity: Severity.error,
    docsSlug: 'analyzer-inconsistency',
    title: 'Resolved code is missing semantic information',
    explanation:
        'package:analyzer returned a resolved unit in which something extraction depends on — a '
        'type, an element — is missing or invalid.\n'
        '\n'
        'This should be impossible: the preflight check (BRG0106) refuses a project whose element '
        'model is incomplete, precisely so that extraction can trust what it is given. If you are '
        'seeing this, either the project is in a state preflight does not yet recognise, or it is a '
        'bug in the compiler. Extraction records the fact rather than inventing a plausible type, '
        'because an invented type is a lie no later stage can detect.',
  );

  /// A framework API is wrapped in a way the adapter cannot read.
  static const DiagnosticCode unsupportedWrapper = DiagnosticCode(
    id: 'BRG1304',
    category: DiagnosticCategory.extraction,
    defaultSeverity: Severity.warning,
    docsSlug: 'unsupported-wrapper',
    title: 'Framework API is wrapped beyond reading',
    explanation:
        'A routing or framework API was reached through something the adapter cannot follow — a route '
        'held in a variable, a path computed at runtime, an onGenerateRoute callback.\n'
        '\n'
        'The compiler reads a wrapper by reading its constructor: `super(path: path)` says that the '
        'wrapper parameter `path` becomes the route path, and that is a fact, not a guess. What it will '
        'not do is invent a convention — "the first argument is probably the path" is right until it is '
        'silently wrong.\n'
        '\n'
        'The consequence is real and worth knowing: a route the compiler cannot see is a route that '
        'cross-route state promotion (N11) will silently do nothing for. Declaring the route inline, or '
        'making its path `const`, makes it visible.',
  );

  /// An adapter recognised a declaration but could not extract it.
  static const DiagnosticCode adapterRejected = DiagnosticCode(
    id: 'BRG1305',
    category: DiagnosticCategory.extraction,
    defaultSeverity: Severity.warning,
    docsSlug: 'adapter-rejected',
    title: 'Adapter recognised but could not extract',
    explanation:
        'An adapter recognised the framework type being used, but the declaration does not carry the '
        'information the adapter needs.\n'
        '\n'
        'This is different from an unknown package: the compiler knows exactly what this is, and is '
        'telling you it cannot read *this instance* of it. Nothing is invented and nothing is dropped '
        'silently.',
  );

  /// Two adapters claimed the same declaration at the same priority.
  static const DiagnosticCode adapterConflict = DiagnosticCode(
    id: 'BRG1306',
    category: DiagnosticCategory.extraction,
    defaultSeverity: Severity.error,
    docsSlug: 'adapter-conflict',
    title: 'Two adapters claim one declaration',
    explanation:
        'Two adapters at the same priority both claim this declaration.\n'
        '\n'
        "That is a bug in the compiler's adapter registry, not in your code. Which adapter won would "
        'depend on the order they happen to be listed in — so the meaning of your program would depend '
        'on the order of a list in our source, which is not something a compiler may ever allow.\n'
        '\n'
        'Adapters are dispatched in (priority, name) order, which is total. A genuine overlap must be '
        'resolved by giving one adapter a higher priority, deliberately.',
  );

  // ── BRG12xx — the canonical builder and the emitter ───────────────────────────────────────────

  /// A reference names a declaration that does not exist.
  static const DiagnosticCode unresolvedReference = DiagnosticCode(
    id: 'BRG1201',
    category: DiagnosticCategory.extraction,
    defaultSeverity: Severity.error,
    docsSlug: 'unresolved-reference',
    title: 'Unresolved reference',
    explanation:
        'A UIR node refers to a declaration by symbol, and no declaration with that symbol exists '
        'anywhere in the program.\n'
        '\n'
        'This is a bug in extraction, not in the analyzed project: the extractor emitted a '
        'reference to something it never emitted.\n'
        '\n'
        'The builder will not resolve the reference to null, drop it, or invent a target. A '
        'dangling reference that reached the compiler would become a node tree that looks complete '
        'and is not.',
  );

  /// Two declarations share one symbol, and would silently merge into one node.
  static const DiagnosticCode duplicateSymbol = DiagnosticCode(
    id: 'BRG1202',
    category: DiagnosticCategory.extraction,
    defaultSeverity: Severity.error,
    docsSlug: 'duplicate-symbol',
    title: 'Duplicate declaration symbol',
    explanation:
        'Two declarations were emitted with the same symbol.\n'
        '\n'
        'A declaration id is a function of its symbol, so two declarations sharing one would '
        'resolve to a single node — silently merging two unrelated things. A symbol must identify '
        'exactly one declaration.',
  );

  /// One id denotes two different nodes — a hash collision, or an unstable symbol.
  static const DiagnosticCode idCollision = DiagnosticCode(
    id: 'BRG1203',
    category: DiagnosticCategory.extraction,
    defaultSeverity: Severity.error,
    docsSlug: 'id-collision',
    title: 'Node id collision',
    explanation:
        'Two nodes with different content were allocated the same id.\n'
        '\n'
        'Node ids are content-addressed, so two textually identical subtrees legitimately share an '
        'id — that is what content addressing means. What must never happen is one id denoting two '
        'DIFFERENT things, which would silently merge unrelated nodes.\n'
        '\n'
        'This is either an unstable symbol or a hash collision. Both are compiler bugs.',
  );

  /// The extractor produced a record the schema rejects.
  static const DiagnosticCode invalidNode = DiagnosticCode(
    id: 'BRG1204',
    category: DiagnosticCategory.extraction,
    defaultSeverity: Severity.error,
    docsSlug: 'invalid-node',
    title: 'Node does not match the schema',
    explanation:
        'The extractor produced a record the UIR schema rejects: a missing required field, a wrong '
        'type, or an unknown node kind.\n'
        '\n'
        'This is a bug in extraction, not in the analyzed project. The builder constructs valid UIR '
        'or none at all; it never emits a partially valid node.',
  );

  /// Two nodes claim the same anchor — the key an override is stored under.
  static const DiagnosticCode duplicateAnchor = DiagnosticCode(
    id: 'BRG1205',
    category: DiagnosticCategory.extraction,
    defaultSeverity: Severity.error,
    docsSlug: 'duplicate-anchor',
    title: 'Duplicate anchor',
    explanation:
        'Two nodes claim the same anchor.\n'
        '\n'
        'An anchor is a structural path, and it is the key a hand-written override is stored under. '
        'It must name exactly one node, or an override would apply to two places at once.',
  );

  /// A raw record contains itself. UIR trees are embedded, so a cycle cannot be represented.
  static const DiagnosticCode cyclicGraph = DiagnosticCode(
    id: 'BRG1206',
    category: DiagnosticCategory.extraction,
    defaultSeverity: Severity.error,
    docsSlug: 'cyclic-graph',
    title: 'Cyclic record graph',
    explanation:
        'The extractor produced a record that contains itself.\n'
        '\n'
        'UIR trees are embedded, not referenced, so a cycle cannot be represented at all. The '
        'builder detects it and says so, rather than recursing until the stack runs out: a stack '
        'overflow is a far worse diagnostic than a sentence.',
  );

  /// A declaration was referenced, but no node with its id survived the build.
  static const DiagnosticCode orphanReference = DiagnosticCode(
    id: 'BRG1207',
    category: DiagnosticCategory.extraction,
    defaultSeverity: Severity.error,
    docsSlug: 'orphan-reference',
    title: 'Reference to a node that is not in the document',
    explanation:
        'A node refers to an id that is not present in the emitted document.\n'
        '\n'
        'The graph would have a hole in it: a consumer following the reference would find nothing. '
        'Nothing is written.',
  );

  /// The program's top-level nodes are not in canonical order.
  static const DiagnosticCode nonCanonicalOrder = DiagnosticCode(
    id: 'BRG1208',
    category: DiagnosticCategory.extraction,
    defaultSeverity: Severity.error,
    docsSlug: 'non-canonical-order',
    title: 'Program is not in canonical order',
    explanation:
        "The program's top-level nodes are not ordered by kind, then by id.\n"
        '\n'
        'Two runs over the same graph would write different bytes — and the cache, the incremental '
        'build and every golden gate downstream depend on them not doing that.',
  );

  /// A node could not be serialized. Nothing is written.
  static const DiagnosticCode serializationFailed = DiagnosticCode(
    id: 'BRG1209',
    category: DiagnosticCategory.extraction,
    defaultSeverity: Severity.error,
    docsSlug: 'serialization-failed',
    title: 'Node could not be serialized',
    explanation:
        'A node could not be turned into JSON.\n'
        '\n'
        'Nothing is written. A partially written NDJSON file is still VALID NDJSON, just with '
        'records missing, so a partial write would never be detected downstream — it would simply '
        'be a program with some of its nodes silently absent.',
  );

  /// Every registered code, in ascending id order.
  ///
  /// The order is a guarantee, not an accident: `explain --list` and the docs site enumerate it.
  static final List<DiagnosticCode> all = _register(<DiagnosticCode>[
    noPubspec,
    noPackageConfig,
    noLibraryDirectory,
    malformedPubspec,
    notAFlutterProject,
    unresolvedImport,
    unknownWidget,
    unsupportedSyntax,
    analyzerInconsistency,
    unsupportedWrapper,
    adapterRejected,
    adapterConflict,
    unresolvedReference,
    duplicateSymbol,
    idCollision,
    invalidNode,
    duplicateAnchor,
    cyclicGraph,
    orphanReference,
    nonCanonicalOrder,
    serializationFailed,
  ]);

  /// Looks up a code by id, or `null` if it is not registered.
  static DiagnosticCode? byId(String id) =>
      all.firstWhereOrNull((DiagnosticCode code) => code.id == id);

  static List<DiagnosticCode> _register(List<DiagnosticCode> codes) {
    final Set<String> seen = <String>{};
    for (final DiagnosticCode code in codes) {
      if (!seen.add(code.id)) {
        throw BridgeInternalError(
          'diagnostics.duplicate-code',
          'Diagnostic code ${code.id} is registered more than once.',
          context: <String, String>{'code': code.id},
        );
      }
    }
    return List<DiagnosticCode>.unmodifiable(
      codes.sorted((DiagnosticCode a, DiagnosticCode b) => a.compareTo(b)),
    );
  }
}
