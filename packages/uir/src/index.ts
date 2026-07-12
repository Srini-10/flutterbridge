// @bridge/uir — the Universal Intermediate Representation: the schema, the generated models, and the
// canonical form that gives every node its identity.
//
// The models are GENERATED from `schema/*.json` by `tools/schema-codegen` (Spec §2.5). Neither
// language domain hand-writes a UIR type, and CI fails if a generated file drifts from the schema.
//
// To change the UIR, change the schema.
//
// BRIDGE-STUB(M1): nodeId(), parseAnchor()/formatAnchor(), the streaming NDJSON reader/writer and the
// migration modules are owned by M1-T3..T6. The generated module already provides the canonical JSON
// form they are all built on.

export * from './generated/uir.js';
