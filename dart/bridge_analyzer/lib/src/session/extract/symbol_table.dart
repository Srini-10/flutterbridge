/// Symbols — the names extraction refers to declarations by.
///
/// Layer: `session` (extraction).
///
/// Extraction never allocates a `NodeId`; it does not know how one is computed and must not. It names
/// declarations by **symbol**, and the canonical builder resolves symbols to ids (M1-T3). A symbol is
/// therefore a promise: *something, somewhere, declares this*. An unkept promise is `BRG1201`, and
/// never a null (INV-4).
///
/// ## Why the shape matters
///
/// A declaration's id is derived from its symbol, which is what makes an incremental build sound: a
/// file being rebuilt resolves a reference into a file that is *not* being rebuilt, and gets exactly
/// the id the cached file was built with (M1-T5). So a symbol must be
///
/// * **stable** — the same declaration yields the same symbol on every run, from any directory;
/// * **unique** — two declarations never collide, or the builder reports `BRG1202`;
/// * **path-relative** — an absolute path would make the id depend on where the project was checked
///   out, which is D3 and was already caught once (M1-T6).
///
/// Hence `kind:lib/a.dart#Owner.member`. The kind prefix keeps a class and the component derived from
/// it distinct, which they must be: they are two nodes.
library;

/// Builds symbols. Pure: the same inputs give the same symbol, always.
final class Symbols {
  /// Creates a symbol factory for the file at project-relative [path].
  const Symbols(this.path);

  /// The file, project-relative.
  final String path;

  /// A class, mixin, enum, or type alias.
  String type(String name) => 'type:$path#$name';

  /// A top-level or static function.
  String function(String name) => 'fn:$path#$name';

  /// A field or top-level variable. [owner] is the class name, or `null` at the top level.
  String variable(String name, {String? owner}) =>
      'var:$path#${owner == null ? '' : '$owner.'}$name';

  /// A component — the widget a class becomes.
  ///
  /// Distinct from [type] on purpose. `LoginScreen` the Dart class and `LoginScreen` the `ui.Component`
  /// are two different nodes, and one refers to the other.
  String component(String name) => 'comp:$path#$name';

  /// A signal: a unit of reactive state.
  String signal(String name, {required String owner}) => 'sig:$path#$owner.$name';

  /// A derived value — a getter over state.
  String derived(String name, {required String owner}) => 'der:$path#$owner.$name';

  /// An action — a method that writes state.
  String action(String name, {required String owner}) => 'act:$path#$owner.$name';

  /// A lifecycle effect. Keyed by timing, since a class has at most one of each.
  String effect(String timing, {required String owner}) => 'eff:$path#$owner.$timing';

  /// A store — a `ChangeNotifier` and its kin.
  String store(String name) => 'store:$path#$name';

  /// A route. Keyed by its path, which is what makes it a route.
  String route(String routePath) => 'route:$path#$routePath';

  /// A navigation edge — an `app.RouteTransition` — keyed by its **ordinal within the file**.
  ///
  /// Every other symbol here names a *declaration*, and a declaration has a name to key on. A transition
  /// has none: it is a call site, and `Navigator.push(...)` is declared nowhere. So the key is the order
  /// it was extracted in, which is the source order of a deterministic walk.
  ///
  /// **This is not span matching and not a heuristic.** Nothing is ever *looked up* by this symbol from
  /// the outside: the transition extractor mints it and hands it back to the very call site that asked,
  /// so a `logic.Navigate` and its `app.RouteTransition` are bound by construction rather than by
  /// searching for one another. The ordinal exists to make the symbol unique, not to make it findable.
  ///
  /// Keyed per file, because a file is the unit both extraction and the incremental cache work in.
  /// Editing one method renumbers the transitions after it in that file and so changes their ids —
  /// exactly as changing any other content does under ADR-17.
  String navigation(int ordinal) => 'nav:$path#$ordinal';

  /// A design token. **Not** file-scoped: a token is a property of the application, and the same
  /// token declared in two places is the same token.
  static String token(String group, String name) => 'token:$group.$name';

  /// The component symbol for a class declared in [libraryUri], which is somewhere *else*.
  ///
  /// A route in `main.dart` refers to `LoginScreen`, which `screens/login_screen.dart` declares. The
  /// symbol must be the one that file emits — building it from the *referring* file's path names a
  /// declaration nobody makes, and the builder rightly rejects it (BRG1201).
  static String? componentIn(
    String libraryUri,
    String name, {
    required String packageName,
    Set<String> localPackages = const <String>{},
    Set<String> extractedDependencyFiles = const <String>{},
  }) {
    final String? path = pathOf(
      libraryUri,
      packageName: packageName,
      localPackages: localPackages,
      extractedDependencyFiles: extractedDependencyFiles,
    );
    return path == null ? null : 'comp:$path#$name';
  }

  /// The store symbol for a class declared in [libraryUri] (ADR-27) — the sibling of [componentIn], for
  /// `_favorites.favoriteCount`-style member access where `_favorites`'s type is declared elsewhere.
  static String? storeIn(
    String libraryUri,
    String name, {
    required String packageName,
    Set<String> localPackages = const <String>{},
    Set<String> extractedDependencyFiles = const <String>{},
  }) {
    final String? path = pathOf(
      libraryUri,
      packageName: packageName,
      localPackages: localPackages,
      extractedDependencyFiles: extractedDependencyFiles,
    );
    return path == null ? null : 'store:$path#$name';
  }

  /// The symbol for a class, mixin, enum, or type alias declared in [libraryUri] — the sibling of
  /// [componentIn] and [storeIn], for an enum constant reference (`Stage.ready`) whose declaring file
  /// may or may not be the referring one (M8-D). Mirrors [type] exactly; the two agree by construction,
  /// since both derive from the same [pathOf].
  static String? typeIn(
    String libraryUri,
    String name, {
    required String packageName,
    Set<String> localPackages = const <String>{},
    Set<String> extractedDependencyFiles = const <String>{},
  }) {
    final String? path = pathOf(
      libraryUri,
      packageName: packageName,
      localPackages: localPackages,
      extractedDependencyFiles: extractedDependencyFiles,
    );
    return path == null ? null : 'type:$path#$name';
  }

  /// The symbol for a top-level variable declared in [libraryUri] — the sibling of [typeIn], for a
  /// bare reference (`protocolVersion`) whose declaring file is not the referring one (M8-J). Mirrors
  /// [variable] exactly; the two agree by construction, since both derive from the same [pathOf] and
  /// the identical `var:` prefix.
  static String? variableIn(
    String libraryUri,
    String name, {
    required String packageName,
    Set<String> localPackages = const <String>{},
    Set<String> extractedDependencyFiles = const <String>{},
  }) {
    final String? path = pathOf(
      libraryUri,
      packageName: packageName,
      localPackages: localPackages,
      extractedDependencyFiles: extractedDependencyFiles,
    );
    return path == null ? null : 'var:$path#$name';
  }

  /// The symbol for a top-level function declared in [libraryUri] — the sibling of [variableIn], for a
  /// bare reference (`formatBytes`) or a tear-off whose declaring file is not the referring one (M8-J).
  /// Mirrors [function] exactly, the identical `fn:` prefix.
  static String? functionIn(
    String libraryUri,
    String name, {
    required String packageName,
    Set<String> localPackages = const <String>{},
    Set<String> extractedDependencyFiles = const <String>{},
  }) {
    final String? path = pathOf(
      libraryUri,
      packageName: packageName,
      localPackages: localPackages,
      extractedDependencyFiles: extractedDependencyFiles,
    );
    return path == null ? null : 'fn:$path#$name';
  }

  /// The signal symbol for a member declared in [libraryUri] (ADR-27).
  static String? signalIn(
    String libraryUri,
    String name, {
    required String owner,
    required String packageName,
    Set<String> localPackages = const <String>{},
    Set<String> extractedDependencyFiles = const <String>{},
  }) {
    final String? path = pathOf(
      libraryUri,
      packageName: packageName,
      localPackages: localPackages,
      extractedDependencyFiles: extractedDependencyFiles,
    );
    return path == null ? null : 'sig:$path#$owner.$name';
  }

  /// The derived symbol for a member declared in [libraryUri] (ADR-27).
  static String? derivedIn(
    String libraryUri,
    String name, {
    required String owner,
    required String packageName,
    Set<String> localPackages = const <String>{},
    Set<String> extractedDependencyFiles = const <String>{},
  }) {
    final String? path = pathOf(
      libraryUri,
      packageName: packageName,
      localPackages: localPackages,
      extractedDependencyFiles: extractedDependencyFiles,
    );
    return path == null ? null : 'der:$path#$owner.$name';
  }

  /// The action symbol for a member declared in [libraryUri] (ADR-27).
  static String? actionIn(
    String libraryUri,
    String name, {
    required String owner,
    required String packageName,
    Set<String> localPackages = const <String>{},
    Set<String> extractedDependencyFiles = const <String>{},
  }) {
    final String? path = pathOf(
      libraryUri,
      packageName: packageName,
      localPackages: localPackages,
      extractedDependencyFiles: extractedDependencyFiles,
    );
    return path == null ? null : 'act:$path#$owner.$name';
  }

  /// The path a library URI names within this analysis root, or `null` if it is outside it.
  ///
  /// `package:hello_bridge/screens/login_screen.dart` → `lib/screens/login_screen.dart` — this
  /// project's own package, named project-relative exactly as it always was (M1–M7; unchanged by
  /// M8-F, so a single-package project's symbols are byte-identical to before it existed).
  ///
  /// `package:continuum_ui_kit/src/onboarding_page.dart`, when `continuum_ui_kit` is in
  /// [localPackages] **and** [libraryUri] is itself a member of [extractedDependencyFiles] (M8-F) →
  /// the URI itself, unchanged — the same shape `ProjectInfo.dependencyLibraryFiles` already names
  /// that file by, so a dependency's own declaration and a reference to it agree on the symbol by
  /// construction, never by matching a path or a name against each other after the fact.
  /// Distinguishable from a project-relative path by construction too: the project's own paths are
  /// always `lib/…`, which contains no colon, so the two spellings can never collide.
  ///
  /// The second check is not redundant with the first. A local dependency's own `analyzer.exclude`
  /// globs (M8-F) — generated protobuf/drift bindings its author opted out of analysis — mean
  /// `ProjectInfo.dependencyLibraryFiles` does not walk every file the package *contains*, only the
  /// ones `AnalysisContextCollection` will actually resolve; `contextFor` genuinely refuses the rest.
  /// The Dart analyzer resolves a *type* declared in an excluded file regardless — exclusion governs a
  /// file's own diagnostics, not whether another file may reference what it declares — so without this
  /// check a package being in [localPackages] alone would promise a declaration this program never
  /// emitted: a dangling reference, `BRG1201`, and a real one — `continuum_protocol`'s generated
  /// `Envelope_Payload` enum is exactly this shape. Membership makes the promise honest: only a symbol
  /// this program actually declared is ever handed back.
  ///
  /// Anything else — the Flutter SDK, an ordinary pub dependency, a package this analysis root does
  /// not include, or a local dependency's own excluded file — yields `null`. Widening [localPackages]
  /// or [extractedDependencyFiles] is the only way to widen what resolves; there is no fallback that
  /// resolves a file this project did not itself extract.
  static String? pathOf(
    String libraryUri, {
    required String packageName,
    Set<String> localPackages = const <String>{},
    Set<String> extractedDependencyFiles = const <String>{},
  }) {
    const String scheme = 'package:';
    if (!libraryUri.startsWith(scheme)) {
      return null;
    }
    final String rest = libraryUri.substring(scheme.length);
    final int slash = rest.indexOf('/');
    if (slash <= 0) {
      return null;
    }
    final String referencedPackage = rest.substring(0, slash);
    if (referencedPackage == packageName) {
      return 'lib/${rest.substring(slash + 1)}';
    }
    if (localPackages.contains(referencedPackage) && extractedDependencyFiles.contains(libraryUri)) {
      return libraryUri;
    }
    return null;
  }
}
