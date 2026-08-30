/// M10-E: bounded instance methods with a trailing OPTIONAL POSITIONAL parameter carrying an explicit
/// default value (ADR-0043) — `[int factor = N]`. Never a NAMED parameter (`{int factor = N}`, still out
/// of scope — see `fixtures/apps/method_call_refusal`) and never an optional parameter WITHOUT a default
/// (`[int? factor]`, still out of scope — same fixture).
///
/// A default value referencing a top-level `const`/`final` variable was investigated and deliberately NOT
/// used here: it reaches a real, pre-existing, DOCUMENTED capability boundary (`expression.ts`'s own
/// `logic.FieldDecl` case, M8-P) that refuses lowering ANY top-level variable reference, everywhere in
/// this codebase — unrelated to default values specifically, and out of this milestone's own scope
/// (ADR-0043's own silent-wrong-code audit records this finding rather than silently expanding into it).
class Model {
  final int count;

  Model(this.count);

  int get doubled => count * 2;

  /// A single trailing optional parameter with a literal default.
  int multiply(int factor, [int bonus = 10]) => count * factor + bonus;

  /// Multiple trailing optional parameters, each with its own default.
  int combine(int a, [int b = 1, int c = 2]) => count + a + b + c;

  /// An optional-parameter method composed with ANOTHER bounded member on the SAME receiver (M10-B) —
  /// proves this milestone's own new capability composes, unchanged, with the existing member-composition
  /// architecture: `multiply`'s own optional argument is itself supplied by this method's own optional
  /// parameter.
  int scaledAndDoubled(int factor, [int bonus = 1]) => multiply(factor, bonus) + doubled;
}
