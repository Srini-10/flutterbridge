/// M10-F: bounded safe-navigation (`?.`) member access (ADR-0044) — a null-aware access on a bare
/// reference receiver (a component prop, a local bound to one, or a method parameter) lowers to a real,
/// single-evaluation conditional, matching Dart's own short-circuit semantics exactly — never silently
/// dropping the `?.` the way this generator did before this milestone.
class Model {
  final int count;

  Model(this.count);

  int get doubled => count * 2;

  /// Multiple arguments, one optional-with-default (M10-C/M10-E) — proves safe navigation composes,
  /// unchanged, with the existing argument-evaluation architecture.
  int multiply(int factor, [int bonus = 0]) => count * factor + bonus;

  /// Method-to-getter composition on the SAME receiver (M10-B) — proves safe navigation at the OUTER
  /// call composes, unchanged, with the existing internal composition mechanism: `quadrupled`'s own body
  /// calls `doubled` internally, completely independent of how `quadrupled` itself was reached.
  int quadrupled() => doubled * 2;

  /// `doubled` is also this class's own getter name — the parameter shadows it. Proves the null-aware
  /// guard's own receiver resolution correctly reads the SHADOWING parameter (a value), never
  /// re-targeting the getter of the identical name, mirroring M10-A/B's own established shadowing proof.
  int describe(Model? doubled) => doubled?.count ?? -1;
}
