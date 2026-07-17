/// The route table, indexed for resolving a navigation to the route it lands on.
///
/// Layer: `builder`.
///
/// A `RawRouteRef` names a route by the concrete path a navigation asks for — `/wonder/3` — and the
/// declaring file is not known at the call site (a `context.go` in a screen names a route the router
/// file declares). Nor is the concrete path the declared one: `/wonder/3` is served by the route whose
/// path is `/wonder/:id`. Resolving either needs the whole route table, which only the builder sees.
///
/// So this is where a path becomes a route id. It is the router's own matching rule, not a heuristic:
///
/// * an **exact** path wins outright — a literal `/detail/new` route is preferred over `/detail/:id`;
/// * otherwise a **pattern** match, segment by segment, where a `:param` segment matches any one
///   segment. A path that matches exactly one route resolves to it.
///
/// A path that matches **none** resolves to nothing, and the caller reports `BRG1308`: the edge is
/// dropped, never pointed at a route that is not there. A path that matches **more than one** pattern
/// is equally unresolved — the compiler will not pick one, because which it picked would be arbitrary.
library;

/// Resolves a concrete navigation path to the id of the route that serves it.
final class RouteIndex {
  /// Creates an index over [routes], each a `(path, id)` pair as the route table declares them.
  RouteIndex(Iterable<({String path, String id})> routes)
    : _routes = List<({String path, String id})>.unmodifiable(routes);

  /// The declared routes, path and id.
  final List<({String path, String id})> _routes;

  /// The id of the route [path] lands on, or `null` if none does — or if more than one pattern would.
  ///
  /// Deterministic: it depends only on the route table, never on the order routes were discovered in.
  String? resolve(String path) {
    // An exact match is unambiguous and always wins: a route declared at the literal `/detail/new` is
    // that path's route even when `/detail/:id` would also fit it.
    for (final ({String path, String id}) route in _routes) {
      if (route.path == path) {
        return route.id;
      }
    }

    final List<String> wanted = _segments(path);
    String? matched;
    for (final ({String path, String id}) route in _routes) {
      if (_patternMatches(_segments(route.path), wanted)) {
        if (matched != null && matched != route.id) {
          // Two routes both fit the path. Neither is more right than the other, and choosing would be
          // a guess — so the path resolves to nothing and is reported (BRG1308).
          return null;
        }
        matched = route.id;
      }
    }
    return matched;
  }

  /// Whether a route [pattern] serves the concrete [path], segment by segment.
  ///
  /// A `:param` segment matches any single segment; every other segment must be equal. Different
  /// lengths never match — `/a/b` is not served by `/a/:x/:y`.
  static bool _patternMatches(List<String> pattern, List<String> path) {
    if (pattern.length != path.length) {
      return false;
    }
    for (int i = 0; i < pattern.length; i++) {
      final String segment = pattern[i];
      if (segment.startsWith(':')) {
        continue;
      }
      if (segment != path[i]) {
        return false;
      }
    }
    return true;
  }

  /// The path split into segments, with the leading empty segment of an absolute path dropped so that
  /// `/a/b` and `a/b` segment the same way.
  static List<String> _segments(String path) =>
      path.split('/').where((String segment) => segment.isNotEmpty).toList();
}
