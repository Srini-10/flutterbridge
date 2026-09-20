/// A plain, eligible project class (ADR-0039) whose method names collide with `dart:core` collection methods on
/// purpose: `add` and `join` here are this class's own, and must not be mistaken for `List.add`/`List.join`.
class Bag {
  final int base;

  Bag(this.base);

  int add(int n) => base + n;

  int join(int n) => base * n;
}
