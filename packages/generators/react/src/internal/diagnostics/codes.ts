// Generation diagnostics — the BRG3xxx range.
//
// `docs/architecture/compiler.md` reserves the ranges: `BRG0xxx` environment, `BRG1xxx` extraction,
// `BRG2xxx` normalization, **`BRG3xxx` generation**, `BRG4xxx` verification. Nothing had ever used
// `BRG3xxx`. Generation claims it here.
//
// ## The rule these encode
//
// A generator that cannot represent something **says so and stops**. It does not approximate. The severity
// semantics are the compiler's, and they are not advisory (`docs/architecture/compiler.md`):
//
// > **error** — the program is not fit to generate from. Something would have to be invented.
// > **warning** — a generator *can* proceed, but will have to guess at something the frontend should have
// >   stated.
// > **info** — the compiler changed something, and is telling you what and why.
//
// So an `error` here means: this construct reached the generator, the generator has no faithful emission for
// it, and the alternative to failing is emitting something the author did not write.

/** A diagnostic code owned by the React generator. */
export const GeneratorDiagnosticCode = {
  /** A widget has no mapping to a runtime component. */
  UnmappedWidget: 'BRG3001',
  /** A `logic.*` construct has no faithful TypeScript lowering. */
  UnsupportedExpression: 'BRG3002',
  /** A `logic.*` statement has no faithful TypeScript lowering. */
  UnsupportedStatement: 'BRG3003',
  /** A `ui.Opaque` / `logic.Opaque*` reached the generator: the frontend could not model it (INV-4). */
  OpaqueConstruct: 'BRG3004',
  /** The program carries an `error` diagnostic from an earlier stage; it is not fit to generate from. */
  ProgramNotFitToGenerate: 'BRG3005',
  /** A reference names a node the program does not contain. */
  UnresolvedReference: 'BRG3006',
  /** A `ui.Async` has no loading or error branch, so a generator would have to invent one. */
  IncompleteAsync: 'BRG3007',
  /** A route transition names a destination the generator cannot turn into a URL (Spec v2.4 §A17.6). */
  UnroutableDestination: 'BRG3008',
  /** Two nodes want the same module-level symbol. */
  SymbolCollision: 'BRG3009',
} as const;

/** A diagnostic code owned by the React generator. */
export type GeneratorDiagnosticCode =
  (typeof GeneratorDiagnosticCode)[keyof typeof GeneratorDiagnosticCode];
