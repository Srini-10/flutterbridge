/// The Universal Intermediate Representation, as Dart models.
///
/// **Every type in this package is generated** from `packages/uir/schema/*.json` by
/// `tools/schema-codegen`. Nothing here is hand-written, and hand-edits to `lib/generated/uir.dart`
/// are lost on the next `pnpm codegen` — CI fails if the generated file does not match the schema.
///
/// To change the UIR, change the schema.
///
/// This file is the package's public surface. It contains no models: it re-exports the generated
/// library, so that the generated file's path is an implementation detail rather than a contract.
library;

export 'generated/uir.dart';
