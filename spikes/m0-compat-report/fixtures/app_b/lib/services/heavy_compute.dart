import 'dart:isolate';

import 'package:flutter/foundation.dart';

/// `compute` spawns an isolate. Isolates have no direct React analogue.
Future<int> sumOfSquares(List<int> input) {
  return compute(_sumOfSquares, input);
}

int _sumOfSquares(List<int> input) =>
    input.fold<int>(0, (int acc, int n) => acc + n * n);

/// A raw isolate spawn, for good measure — this is the harder case.
Future<void> spawnWorker(SendPort port) async {
  await Isolate.spawn(_worker, port);
}

void _worker(SendPort port) {
  port.send('done');
}
