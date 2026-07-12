/// Hashing primitives.
///
/// Layer: `cache` — depends on `util` only.
///
/// One hash function, used everywhere. If the compiler ever hashed two things two different ways, a
/// key computed in one place would not match the same key computed in another, and the failure would
/// look like "the cache mysteriously never hits" rather than like a bug.
library;

import 'dart:convert';

import 'package:crypto/crypto.dart';

/// How many hex characters of a digest a hash keeps.
///
/// The same width as a `NodeId` (Spec §2.3). Sixty-four bits is far more than enough to make an
/// accidental collision impossible in a codebase of any size, and it keeps cache paths short.
const int hashLength = 16;

/// Hashes [bytes].
String hashBytes(List<int> bytes) => sha256.convert(bytes).toString().substring(0, hashLength);

/// Hashes [text], as UTF-8.
String hashString(String text) => hashBytes(utf8.encode(text));

/// Hashes an ordered sequence of parts, unambiguously.
///
/// Each part is length-prefixed. Without that, `['ab', 'c']` and `['a', 'bc']` would hash the same —
/// and a cache key that cannot distinguish its own inputs returns the wrong answer silently, on
/// exactly the inputs nobody thought to test.
String hashParts(Iterable<String> parts) {
  final StringBuffer buffer = StringBuffer();
  for (final String part in parts) {
    buffer
      ..write(part.length)
      ..write(':')
      ..write(part)
      ..write(' ');
  }
  return hashString(buffer.toString());
}
