import 'other_model.dart';

/// M10-D: bounded instance-method RETURN VALUES — proving a primitive or eligible-project-class result may
/// be consumed by arithmetic, a further property read, a further eligible getter, or a further eligible
/// method call, on the SAME class or a DIFFERENT one, in the SAME file or a DIFFERENT one (ADR-0042).
class Model {
  final int count;

  Model(this.count);

  int get doubled => count * 2;
  int multiply(int factor) => count * factor;

  /// Method-after-method chaining on the SAME class (M10-D's own critical chaining case, ADR-0042 §2) —
  /// `next()`'s own result becomes the RECEIVER of a further method call, never
  /// `Model_next(self).multiply(...)` (there is no such runtime method).
  Model next() => Model(count + 1);

  /// A project-class return produced by a REAL CONSTRUCTION inside the method's own body (not merely
  /// re-returning an existing field) — proves a method's own return value may itself be freshly built,
  /// not only forwarded.
  Model transform(int delta) => Model(count + delta);

  /// A project-class return declared in a SEPARATE Dart file (`other_model.dart`) — the cross-file
  /// reduction-ladder item (ADR-0042 §2's own cross-file proof).
  OtherModel toOther() => OtherModel(count);

  /// `Wrapped` (see its own doc comment, `other_model.dart`) has no getter or method of its own — reached
  /// EXCLUSIVELY through this method's own return type, isolating the transitive class-type-reachability
  /// fixed point (ADR-0041 §3) as the ONLY mechanism that can discover it.
  Wrapped wrap() => Wrapped(count);
}

/// A SEPARATE project class, referenced only through method-RETURN chaining (never a field) — proving a
/// method-after-method chain composes correctly ACROSS classes, not merely within one (ADR-0042 §2), and
/// the exact shape that exposed a real, pre-existing cross-class method-helper emission-ordering gap this
/// milestone found and fixed (ADR-0042 §5): the per-class member-helper retry loop, before this milestone,
/// never revisited a class whose own dependency resolved only AFTER its own retry loop had already
/// finished. `Leader`'s own id is confirmed (by real generation) to sort BEFORE `Follower`'s in the
/// class-emission order — so `Leader`, not `Follower`, is deliberately the DEPENDENT class here, making
/// this fixture a genuine, permanent regression proof for the fix (mutating the global retry loop back to
/// a per-class one breaks THIS exact test, not merely a scratch probe).
class Leader {
  final int count;

  Leader(this.count);

  Follower toFollower() => Follower(count);

  /// The CRITICAL cross-class chaining case: `toFollower()`'s own result becomes the receiver of
  /// `Follower.terminal()` — must lower to `Follower_terminal(Leader_toFollower(self))`, never
  /// `Leader_toFollower(self).terminal()`.
  int chain() => toFollower().terminal();
}

class Follower {
  final int count;

  Follower(this.count);

  int terminal() => count * 2;
}
