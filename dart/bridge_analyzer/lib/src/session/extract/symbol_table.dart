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
  static String? componentIn(String libraryUri, String name, {required String packageName}) {
    final String? path = pathOf(libraryUri, packageName: packageName);
    return path == null ? null : 'comp:$path#$name';
  }

  /// The project-relative path of a library URI, or `null` if it is not in this project.
  ///
  /// `package:hello_bridge/screens/login_screen.dart` → `lib/screens/login_screen.dart`. A widget from
  /// `package:flutter/…` is not ours to declare, and yields `null`.
  static String? pathOf(String libraryUri, {required String packageName}) {
    const String scheme = 'package:';
    if (!libraryUri.startsWith(scheme)) {
      return null;
    }
    final String rest = libraryUri.substring(scheme.length);
    final int slash = rest.indexOf('/');
    if (slash <= 0 || rest.substring(0, slash) != packageName) {
      return null;
    }
    return 'lib/${rest.substring(slash + 1)}';
  }
}
