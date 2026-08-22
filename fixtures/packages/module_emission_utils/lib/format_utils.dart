// Rungs A, B, C, D, E, F/G, H, I, K, L, Q of the M8-U reduction ladder — self-contained,
// project-defined top-level functions with no cross-declaration dependency, matching the real shape
// of Continuum's own `formatUptime` (early-return chain, no locals, no project-declaration calls) plus
// a small set of adjacent shapes that exercise locals, arithmetic, and same-file function-to-function
// calls, all through supported machinery only.

/// A — zero parameters, a literal return.
String greet() => 'Hello';

/// B — one primitive parameter.
String greetName(String name) => name;

/// C — two primitive parameters.
int addTwo(int a, int b) => a + b;

/// D/E — a local `final`, then a second local, then a return reading both (ADR-28 identity).
String describeCount(int count) {
  final bool plural = count != 1;
  final String label = plural ? 'items' : 'item';
  return '$count $label';
}

/// F/G — an early-return chain, the exact shape `formatUptime` itself uses.
String classify(int n) {
  if (n < 0) return 'negative';
  if (n == 0) return 'zero';
  return 'positive';
}

/// H — arithmetic.
int square(int n) => n * n;

/// I/K — string interpolation over a property/method access on the function's own parameter, using a
/// method that has a real JS equivalent (unlike `Duration.inMinutes`/`int.remainder`, deliberately not
/// used here — see refused_shapes.dart's own sibling investigation in the milestone doc).
String shout(String s) => '${s.toUpperCase()}!';

/// L — a same-file call from one project-defined top-level function to another.
String describeBoth(int a, int b) => '${classify(a)} and ${classify(b)}';

/// Q — never referenced from any render tree or reachable action. Must not be emitted.
String neverCalled() => 'unreachable';
