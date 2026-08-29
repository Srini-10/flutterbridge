/// M10-B's own canonical positive example — a getter (`doubled`) and a method (`multiply`), both
/// already proven in isolation (M9-Q/ADR-0039), now composed: `quadrupled`/`octupled`/`combined` each
/// call ANOTHER bounded executable member on the SAME receiver, in both the bare (implicit `this`) and
/// explicit (`this.`) forms Dart itself treats as identical.
class Model {
  final int count;

  Model(this.count);

  int get doubled => count * 2;
  int multiply(int factor) => count * factor;

  /// Method → getter, implicit `this`.
  int quadrupled() => doubled * 2;

  /// Method → getter, explicit `this` — the identical semantic member target as the bare form above.
  int quadrupledExplicit() => this.doubled * 2;

  /// Method → method, implicit `this`.
  int octupled() => multiply(8);

  /// Method → method, explicit `this` — the identical semantic member target as the bare form above.
  int octupledExplicit() => this.multiply(8);

  /// Both dependency kinds in one method (M10-B §72's own suggested shape).
  int combined(int factor) => doubled + multiply(factor);

  /// A PARAMETER named identically to the getter `doubled` — the parameter wins; a bare `doubled`
  /// reference inside this body must remain lexical, never a dependency edge to the getter (M10-B §36/§63).
  int shadowedByParam(int doubled) => doubled;

  /// The identical shadow, but reading `this.doubled` explicitly — the explicit member target wins even
  /// under shadowing (M10-B §37), the method-composition sibling of ADR-0039's own `this.value + value`
  /// proof (M10-A §13/§58).
  int shadowedByParamExplicit(int doubled) => this.doubled;

  /// Declared BEFORE its own dependency, deliberately — a real proof the fixed-point RETRY loop is
  /// load-bearing, not decorative: a single, declaration-ordered pass (mutation-tested directly) fails
  /// this exact case, since `lateHelper` is not yet in `methodHelpers` on `earlyCaller`'s own first
  /// attempt. Declaration order is not a dependency order (mirroring `reachableFunctions`'s own
  /// "Attempts, not a single ordered pass" doc comment, M10-B's own extension of it to member helpers).
  int earlyCaller() => lateHelper() * 3;

  int lateHelper() => count + 1;
}

/// Transitive, directional reachability proof (M10-B §56) — `a` depends on `b`, which depends on `c`.
/// Used only via `.a()` (`ChainFullDemo`, below): all three must become reachable, not just `a` itself.
class ChainFull {
  final int count;

  ChainFull(this.count);

  int c() => count;
  int b() => c();
  int a() => b();
}

/// The identical chain shape as [ChainFull], used only via `.b()` (`ChainPartialDemo`, below) — `b`/`c`
/// must become reachable, but `a` must NOT: reachability is directional, never "the whole class is
/// reachable because one of its own members is" (M10-B §56, the negative half of the proof).
class ChainPartial {
  final int count;

  ChainPartial(this.count);

  int c() => count;
  int b() => c();
  int a() => b();
}
