/// Reading a colour out of Dart's constant model.
///
/// Layer: `session` — this is the only layer that may know `package:analyzer` exists, and `DartObject`
/// is its type.
///
/// ## Why this is one function and not two
///
/// Until M5-E the walk below existed **twice**, character for character in its arithmetic:
/// `flutter_adapter._channelsOf` and `expression_extractor._packChannels`. They were written for
/// different callers — one resolves a widget's colour parameter, the other hoists a constant colour into
/// a token — and neither knew about the other.
///
/// That is not a tidiness complaint. The two copies had to be **fixed twice for the same defect**: M5-A's
/// D1/D2 (`Colors.deepPurple` silently unresolvable) required the same change in both, and both doc
/// comments still narrate that incident independently. Flutter has already changed its colour
/// representation once, at 3.27; the next change would have to be found in both places, and the failure
/// mode of finding only one is that colours resolve on one extraction path and not the other — silently,
/// because a colour that does not resolve is simply absent rather than wrong.
///
/// ADR-21 governs this encoding and its evidence table names a single producer. Now there is one.
library;

import 'package:analyzer/dart/constant/value.dart';
import 'package:analyzer/dart/element/type.dart';

/// One channel, as Flutter's post-3.27 doubles store it: `0.0`–`1.0` → `0`–`255`.
int _channel(double value) => (value * 255).round().clamp(0, 255);

/// Whether [type] **is** a `Color` — itself, or by extending one.
///
/// **By supertype, never by name.** C1's evidence is about the cost of a name test: a name answers a
/// question about spelling when the compiler needs an answer about types. A `MaterialColor` and a
/// `ColorSwatch` are `Color`s that also index a set of shades; the shade map is extra, and the swatch's
/// own channels are its primary colour — which is exactly what Flutter reads when a swatch is used where
/// a colour is expected.
bool isColourType(DartType? type) {
  if (type is! InterfaceType) {
    return false;
  }
  if (type.element.name == 'Color') {
    return true;
  }
  return type.allSupertypes.any((InterfaceType s) => s.element.name == 'Color');
}

/// The packed ARGB of a colour constant, in either form Flutter has used, at any depth.
///
/// Three facts about the constant model, each of which cost a real defect:
///
///  1. **Flutter changed representation.** Before 3.27 a `Color` stored a packed `value` int; since then
///     it stores `a`/`r`/`g`/`b` as doubles and `value` is a computed getter, which a constant evaluator
///     cannot see. A reader that knows only one form finds no colours on half the SDKs, so both are read
///     at every level.
///  2. **`getField` does not see inherited fields.** The model represents a subclass constant as its own
///     fields plus a synthetic `(super)` object, so a `MaterialColor`'s channels are two levels up —
///     `MaterialColor → ColorSwatch<int> → Color`. Without the walk, `Colors.deepPurple` reads as nothing.
///  3. **A swatch is a colour.** Reading through to `Color` reads a swatch's *primary*, which is what
///     Flutter uses wherever a swatch is given as a colour. The shade map is not lost so much as not asked
///     for: nothing in a `ColorScheme.fromSeed` consults it.
///
/// M5-A found (2) on the first real application the compiler was pointed at: every `Colors.<swatch>` in
/// Flutter's palette — `blue`, `red`, `deepPurple`, `teal` — was silently unresolvable. The build proof
/// missed it because `Colors.white` and `Colors.black12` are plain `Color`s, not swatches.
///
/// Returns `null` when [value] carries no channels at any level, which is how a non-colour constant and
/// an unreadable one are told apart from a black one.
int? packedArgbOf(DartObject value) {
  for (DartObject? level = value; level != null; level = level.getField('(super)')) {
    final int? packed = level.getField('value')?.toIntValue();
    if (packed != null) {
      return packed;
    }

    final double? a = level.getField('a')?.toDoubleValue();
    final double? r = level.getField('r')?.toDoubleValue();
    final double? g = level.getField('g')?.toDoubleValue();
    final double? b = level.getField('b')?.toDoubleValue();
    if (a != null && r != null && g != null && b != null) {
      return (_channel(a) << 24) | (_channel(r) << 16) | (_channel(g) << 8) | _channel(b);
    }
  }
  return null;
}

/// A packed ARGB as the `#AARRGGBB` string ADR-21 specifies.
///
/// Upper case and always eight digits: the token value is hashed into cache keys and compared as text, so
/// `#ff6750a4` and `#FF6750A4` must never both be reachable.
String argbHex(int colour) =>
    '#${(colour & 0xFFFFFFFF).toRadixString(16).padLeft(8, '0').toUpperCase()}';
