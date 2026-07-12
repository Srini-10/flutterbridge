/// Source locations.
///
/// Layer: `model` — depends on `util` only.
library;

import 'package:meta/meta.dart';

/// A location in a Dart source file.
///
/// Immutable, value-equal, and totally ordered. Diagnostics sort by it, so its ordering must be
/// total: two distinct spans must never compare equal (see [compareTo]).
@immutable
final class SourceSpan implements Comparable<SourceSpan> {
  /// Creates a span at [file], starting at 1-based [line] and [column].
  const SourceSpan({
    required this.file,
    required this.line,
    required this.column,
    this.length = 0,
  }) : assert(line >= 1, 'lines are 1-based'),
       assert(column >= 1, 'columns are 1-based'),
       assert(length >= 0, 'length cannot be negative');

  /// Project-relative path of the file. Never absolute: absolute paths would make output depend on
  /// where the project happens to sit on disk, which is a determinism defect (D1–D5).
  final String file;

  /// 1-based line.
  final int line;

  /// 1-based column.
  final int column;

  /// Length of the span in characters. Zero means a point.
  final int length;

  @override
  int compareTo(SourceSpan other) {
    final int byFile = file.compareTo(other.file);
    if (byFile != 0) {
      return byFile;
    }
    final int byLine = line.compareTo(other.line);
    if (byLine != 0) {
      return byLine;
    }
    final int byColumn = column.compareTo(other.column);
    if (byColumn != 0) {
      return byColumn;
    }
    return length.compareTo(other.length);
  }

  /// The canonical `file:line:column` rendering used in diagnostics and reports.
  @override
  String toString() => '$file:$line:$column';

  /// The span's wire form, matching the UIR schema's `SourceSpan`.
  ///
  /// `length` is omitted when it is zero: an absent field and a field set to a default are different
  /// statements, and the schema means the first.
  Map<String, Object?> toJson() => <String, Object?>{
    'file': file,
    'line': line,
    'column': column,
    if (length > 0) 'length': length,
  };

  @override
  bool operator ==(Object other) =>
      other is SourceSpan &&
      other.file == file &&
      other.line == line &&
      other.column == column &&
      other.length == length;

  @override
  int get hashCode => Object.hash(file, line, column, length);
}
