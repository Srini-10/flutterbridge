// The program: an immutable, indexed UIR document.
//
// Every pass takes one of these and returns another. Nothing is ever mutated in place — not because
// immutability is fashionable, but because a pass that mutates its input makes the pipeline
// unreplayable: you cannot run pass 7 again without re-running 1..6, you cannot diff what a pass did,
// and a bug in pass 3 shows up as a wrong answer from pass 9.

import {
  canonicalEncode,
  parseUirNode,
  UIR_REFERENCE_FIELDS,
  type AnyUirNode,
  type NodeId,
} from '@bridge/uir';

/** A UIR document: nodes, indexed by id, in canonical order. */
export class Program {
  /**
   * Nodes in canonical order — (kind, id), the same order the analyzer emitted them in.
   *
   * The order is part of the contract, not an accident: two runs that produce the same nodes must
   * produce the same bytes, and the only way to guarantee that is to never let discovery order reach
   * the output (D2).
   */
  readonly nodes: readonly AnyUirNode[];

  readonly #byId: ReadonlyMap<NodeId, AnyUirNode>;

  private constructor(nodes: readonly AnyUirNode[], byId: ReadonlyMap<NodeId, AnyUirNode>) {
    this.nodes = nodes;
    this.#byId = byId;
    Object.freeze(this);
  }

  /**
   * Builds a program from [nodes], deduplicated by id and re-imposed into canonical order.
   *
   * **Deduplicated, because two nodes with one id ARE one node.** That is what content addressing means
   * (§A16): two structurally identical subtrees hash to the same id, so a pass that lifts the same
   * closure out of two buttons has produced one action, not two — and emitting it twice would put the
   * same id on two lines and make the document self-contradictory.
   */
  static of(nodes: readonly AnyUirNode[]): Program {
    const byId = new Map<NodeId, AnyUirNode>();
    for (const node of nodes) byId.set(node.id, node);

    const sorted = [...byId.values()].sort(compareNodes);
    return new Program(Object.freeze(sorted), byId);
  }

  /** The node with [id], or undefined. */
  get(id: NodeId): AnyUirNode | undefined {
    return this.#byId.get(id);
  }

  /** Whether [id] denotes a node in this program. */
  has(id: NodeId): boolean {
    return this.#byId.has(id);
  }

  /** Every node of [kind], in canonical order. */
  ofKind<K extends AnyUirNode['kind']>(kind: K): readonly Extract<AnyUirNode, { kind: K }>[] {
    return this.nodes.filter((n): n is Extract<AnyUirNode, { kind: K }> => n.kind === kind);
  }

  /** A new program with [replacements] applied, keyed by the id each replaces. */
  with(replacements: ReadonlyMap<NodeId, AnyUirNode>): Program {
    if (replacements.size === 0) return this;
    return Program.of(this.nodes.map((node) => replacements.get(node.id) ?? node));
  }

  /**
   * The document as canonical NDJSON — the bytes a consumer downstream receives.
   *
   * `canonicalEncode`, not `JSON.stringify`: the encoding is the specification's, not the host's
   * (§A15, §A16). JavaScript writes the double `100.0` as `100` and Dart writes `100.0`; a node with
   * two byte-forms has two ids, and the moment N5 mints a node in TypeScript the two domains would
   * disagree about what it is called.
   */
  toNdjson(): string {
    return this.nodes.map((n) => canonicalEncode(n)).join('\n') + '\n';
  }
}

/** Canonical order: by kind, then by id. Total, and independent of discovery order. */
function compareNodes(a: AnyUirNode, b: AnyUirNode): number {
  const byKind = a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0;
  if (byKind !== 0) return byKind;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Every NodeId a node refers to, excluding its own.
 *
 * Read from `UIR_REFERENCE_FIELDS`, which is **generated from the schema** — so a new reference field
 * added to the schema is followed here automatically, and cannot be forgotten. A hand-maintained list
 * of "fields that hold ids" is a list that goes stale the first time somebody adds one.
 */
export function referencesOf(node: AnyUirNode): readonly NodeId[] {
  const fields = UIR_REFERENCE_FIELDS[node.kind] ?? [];
  const found: NodeId[] = [];

  for (const field of fields) {
    if (field === 'id') continue;
    const value = (node as unknown as Record<string, unknown>)[field];
    if (typeof value === 'string') found.push(value as NodeId);
    else if (Array.isArray(value)) {
      for (const item of value) if (typeof item === 'string') found.push(item as NodeId);
    }
  }
  return found;
}

/** Parses NDJSON into nodes. Rejects anything the schema does not admit. */
export function parseNdjson(document: string): AnyUirNode[] {
  const nodes: AnyUirNode[] = [];
  const lines = document.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === '') continue;

    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch (cause) {
      throw new Error(`line ${i + 1}: not valid JSON`, { cause });
    }
    // Validated, not cast. A record the schema does not admit must fail here, at the boundary — not
    // three passes later as an undefined property nobody can trace back.
    nodes.push(parseUirNode(json, `line ${i + 1}`));
  }
  return nodes;
}
