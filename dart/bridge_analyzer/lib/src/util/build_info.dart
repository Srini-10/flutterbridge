/// Build identity.
///
/// Layer: `util`.
library;

/// The version of `bridge_analyzer`.
///
/// A compile-time constant, deliberately: reading it from `pubspec.yaml` at runtime would make the
/// manifest depend on a file's presence and location on disk, and a manifest must depend on nothing
/// but the compiler that wrote it.
///
/// It is kept in step with `pubspec.yaml` by a test, not by discipline.
const String bridgeBuildVersion = '0.1.0';
