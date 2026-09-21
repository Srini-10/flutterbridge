/// A plain enum stays plain: it is its value names.
enum Mode { fast, slow }

/// An enhanced enum: fields, a const constructor with named arguments, getters and methods.
enum MatchKind {
  words(floor: 0.45, pass: 0.63, top: 0.90),
  tune(floor: 0.30, pass: 0.50, top: 0.80),
  loose(floor: 0.10, pass: 0.20, top: 0.30);

  const MatchKind({required this.floor, required this.pass, required this.top});

  final double floor;
  final double pass;
  final double top;

  double get span => top - floor;

  bool passes(double score) => score >= pass;

  String label() => switch (this) {
        MatchKind.words => 'Words',
        MatchKind.tune => 'Tune',
        MatchKind.loose => 'Loose',
      };
}

/// Positional constructor arguments and a named constructor.
enum Planet {
  mercury(3.303e+23, 2.4397e6),
  earth(5.976e+24, 6.37814e6);

  const Planet(this.mass, this.radius);

  final double mass;
  final double radius;

  double get gravity => 6.67300E-11 * mass / (radius * radius);
}

/// A bare `values` and a bare constant inside the enum's own static method.
enum Level {
  low('l'),
  high('h');

  const Level(this.tag);
  final String tag;

  static Level fromTag(String t) => values.firstWhere((Level e) => e.tag == t, orElse: () => low);

  static int count() => values.length;
}

/// Only its static method is used: reaching the method reaches the enum.
enum Unit {
  one(1);

  const Unit(this.n);
  final int n;

  static int magic() => one.n + 41;
}
