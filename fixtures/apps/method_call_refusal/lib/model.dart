/// A plain, otherwise-fully-supported project-defined class — its constructor is bounded and
/// structural (M9-O), but `multiply` is an instance method, which M9-Q deliberately deferred (methods
/// are DEFERRED-M10+, not silently allowed). Valid Dart throughout: this file's own job is to prove the
/// method call refuses honestly, not that the source itself is invalid.
class Model {
  final int count;

  Model(this.count);

  int multiply(int factor) => count * factor;
}
