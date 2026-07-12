// The loader: NDJSON in, a validated Program out.
//
// This is the boundary between the two language domains, and it is the place a mistake is cheapest to
// catch. The analyzer writes a manifest beside its document saying which schema it was built against;
// the loader refuses a document built against a different one.
//
// That refusal matters more than it looks. A UIR node built against schema A and read against schema B
// does not *fail* — it deserializes, with a field missing or an enum value the reader has never heard
// of, and the compiler carries on and produces something subtly wrong. Amending the schema in v2.2
// (logic.Assign) is exactly the kind of change that makes an old document unreadable while still
// looking readable.

import { UIR_SCHEMA_HASH, UIR_VERSION } from '@bridge/uir';

import { parseNdjson, Program } from './program.js';

/** What the analyzer wrote beside its document. */
export interface Manifest {
  readonly buildVersion: string;
  readonly diagnosticCount: number;
  readonly format: string;
  readonly recordCount: number;
  readonly schemaHash: string;
  readonly uirVersion: string;
}

/** A document the compiler will not read, and why. */
export class LoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoadError';
  }
}

/** Loads a UIR document, refusing one this compiler cannot read. */
export function load(document: string, manifest?: Manifest): Program {
  if (manifest !== undefined) {
    if (manifest.schemaHash !== UIR_SCHEMA_HASH) {
      throw new LoadError(
        `this document was built against UIR schema ${manifest.schemaHash} (v${manifest.uirVersion}), ` +
          `and this compiler reads ${UIR_SCHEMA_HASH} (v${UIR_VERSION}). It is not readable, and it is ` +
          `not *unreadable* either — it would deserialize, with fields the reader does not know, and ` +
          `the compiler would carry on and be quietly wrong. Re-run the analyzer.`,
      );
    }
    if (manifest.format !== 'ndjson/1') {
      throw new LoadError(`unknown wire format "${manifest.format}"; this compiler reads ndjson/1`);
    }
  }

  const nodes = parseNdjson(document);

  if (manifest !== undefined && nodes.length !== manifest.recordCount) {
    // A truncated document. The analyzer writes atomically (INV-2), so this means something between
    // the two truncated it — and half a program is far more dangerous than none.
    throw new LoadError(
      `the manifest declares ${manifest.recordCount} records and the document has ${nodes.length}. ` +
        `The document is truncated.`,
    );
  }

  return Program.of(nodes);
}
