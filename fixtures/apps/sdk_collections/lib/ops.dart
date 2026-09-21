String search(List<int> xs) {
  final int a = xs.firstWhere((int x) => x > 2, orElse: () => -1);
  final int b = xs.lastWhere((int x) => x < 4, orElse: () => -2);
  final int c = xs.singleWhere((int x) => x == 3, orElse: () => -3);
  final int d = xs.singleWhere((int x) => x > 100, orElse: () => -4);
  return '$a $b $c $d ${xs.indexWhere((int x) => x == 3)} ${xs.indexWhere((int x) => x == 9)} ${xs.indexWhere((int x) => x == xs.first)} ${xs.elementAt(1)}';
}

String folds(List<int> xs) {
  final int sum = xs.fold<int>(0, (int p, int e) => p + e);
  final String joined = xs.fold<String>('', (String p, int e) => '$p$e');
  final int biggest = xs.reduce((int a, int b) => a * 10 + b);
  return '$sum $joined $biggest ${xs.every((int x) => x > 0)} ${xs.every((int x) => x > 1)} ${xs.any((int x) => x > 4)}';
}

String shapes(List<int> xs) {
  final List<int> ex = xs.expand((int x) => <int>[x, x * 10]).toList();
  final List<int> tw = xs.takeWhile((int x) => x < 3).toList();
  final List<int> sw = <int>[...xs, 1].skipWhile((int x) => x < 3).toList();
  final List<int> fb = xs.followedBy(<int>[7, 8]).toList();
  return '${ex.join(',')} ${tw.join(',')} ${sw.join(',')} ${fb.join(',')} ${xs.toSet().length}';
}

String singles(List<int> one, List<int> none) {
  return '${one.single} ${none.firstOrNull} ${one.firstOrNull} ${none.lastOrNull} ${one.lastOrNull}';
}

String sets(Set<int> a, Set<int> b) {
  final List<int> u = a.union(b).toList()..sort();
  final List<int> i = a.intersection(b).toList()..sort();
  final List<int> d = a.difference(b).toList()..sort();
  return '${u.join(',')} | ${i.join(',')} | ${d.join(',')} ${a.containsAll(<int>[1, 2])} ${a.containsAll(<int>[1, 9])} ${a.where((int x) => x > 1).length}';
}

String maps(Map<String, int> m) {
  final Map<String, int> copy = Map<String, int>.from(m);
  copy.update('a', (int v) => v + 10);
  copy.update('z', (int v) => v + 10, ifAbsent: () => 100);
  copy.removeWhere((String k, int v) => v == 2);
  final List<String> seen = <String>[];
  copy.forEach((String k, int v) => seen.add('$k=$v'));
  final Map<String, String> mapped = copy.map((String k, int v) => MapEntry<String, String>(k.toUpperCase(), '$v'));
  final Map<int, String> fromEntries = Map<int, String>.fromEntries(<MapEntry<int, String>>[const MapEntry<int, String>(1, 'x'), MapEntry<int, String>(2, 'y')]);
  return '${seen.join(',')} ${mapped['A']} ${mapped['Z']} ${fromEntries[2]} ${copy.length} ${m.length}';
}

String constructors(List<int> xs) {
  final List<int> a = List<int>.from(xs);
  a.add(99);
  final List<int> g = List<int>.generate(4, (int i) => i * i);
  final List<String> f = List<String>.filled(3, 'z');
  final Set<int> s = Set<int>.from(<int>[1, 1, 2]);
  return '${a.length} ${xs.length} ${g.join(',')} ${f.join('')} ${s.length}';
}
