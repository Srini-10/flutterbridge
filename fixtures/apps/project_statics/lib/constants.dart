const int kMax = 3;
const String kName = 'app-$kMax';
final double kScale = kMax * 1.5;

abstract final class Spacing {
  static const double xs = 8;
  static const double md = xs * 2;
  static const String label = 'sp';
  static final List<int> steps = <int>[1, 2, 3];
  static const Duration wait = Duration(seconds: 2);
  static const int doubled = kMax * 2;
}

class Limits {
  const Limits._();
  static const int rows = 4;
  static const int cells = rows * Spacing.doubled;
}

class Alpha {
  static const int id = 1;
  static const String tag = 'a';
}

class Beta {
  static const int id = 2;
  static const String tag = 'b';
}
