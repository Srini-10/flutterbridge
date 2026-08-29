/// A SEPARATE Dart file (M10-D) — proving a method's own return type, resolved cross-file, carries its
/// real emitted type and composes with a further getter call exactly as a same-file return would
/// (ADR-0042 §2's own cross-file proof). Reachable ONLY through `Model.toOther()`'s own return type — never
/// a component parameter or a same-file field — the exact shape that exercises the transitive class-type-
/// reachability fixed point ADR-0041 §3 already built.
class OtherModel {
  final int value;

  OtherModel(this.value);

  int get doubled => value * 2;
}

/// A class with NO getter or method of its own — reachable EXCLUSIVELY through `Model.wrap()`'s own
/// return type (never a component parameter, never independently a member-owner class). Isolates the
/// transitive class-type-reachability fixed point (ADR-0041 §3) from the "also independently reachable as
/// a member owner" case `OtherModel` itself is: without the transitive walk, `Wrapped` would never enter
/// `classIdsNeedingTypes` at all, and `Model.wrap()`'s own return type — along with the field read below —
/// would silently render `unknown`.
class Wrapped {
  final int value;

  Wrapped(this.value);
}
