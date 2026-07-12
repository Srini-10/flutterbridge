/// Node identity.
///
/// Layer: `builder`.
///
/// ## The conflict this file resolves (ISSUE-6, open for review)
///
/// Spec §2.3 defines `NodeId` as a pure content hash:
/// `blake3(canonicalJson(node ⊖ {id, anchor, loc}))`.
///
/// The frozen L3 schema, however, has `Store.signals: [NodeId]` and `Signal.store: NodeId` — two
/// declarations that reference each other. If a node's id is a hash of its content, and its content
/// contains the id of a node whose content contains *its* id, then **no id can ever be computed**.
/// The rule and the schema are mutually unsatisfiable for L3 declarations.
///
/// This is not a defect in either one taken alone, and it is not something to paper over. Until the
/// architecture review rules on it, the builder uses a **two-tier strategy**:
///
/// | Node | Id | Why |
/// | --- | --- | --- |
/// | **Declarations** (signals, stores, actions, effects, derivations, components, routes, endpoints, tokens, files) | hash of a **stable symbol** — the library path plus the declaration path | Breaks the cycle: an id that does not depend on content cannot depend on an id that depends on it. |
/// | **Tree nodes** (expressions, statements, bindings, widget nodes) | hash of **canonical content**, exactly as Spec §2.3 says, excluding `id`, `anchor` and `span` | Content-addressed, so identical subtrees are literally the same node. |
///
/// Both tiers satisfy the two properties the compiler actually depends on:
///
/// * **Determinism** — identical input always produces identical ids.
/// * **Stability under unrelated edits** — `span` is excluded from *both* hashes. Adding a line at
///   the top of a file must not change every id below it, or the incremental cache (ADR-5) is
///   worthless and every override anchor is orphaned on every save.
///
/// ## Occurrence vs. content
///
/// Excluding `span` has a consequence that must be stated plainly: two textually identical subtrees
/// — `Text('Sign in')` in two places — hash to the **same id**. That is what content addressing
/// *means*: they are the same node, and sharing them is a feature (one cache entry, one adapter
/// lookup).
///
/// Occurrence identity is carried by `anchor`, which is a structural path and is unique per
/// occurrence. So the two frozen fields do exactly one job each:
///
/// * `id` — *what* the node is (content identity, deduplicated).
/// * `anchor` — *where* the node is (occurrence identity, the override key).
///
/// Validation therefore enforces **unique anchors** and **functional ids** (one id never denotes two
/// different contents), not "every id appears once".
library;

import 'package:bridge_uir/bridge_uir.dart' as uir;

/// Allocates node ids.
///
/// Stateless and deterministic: the same input always yields the same id, in any process, on any
/// machine, in any order.
final class IdAllocator {
  /// Creates an allocator.
  const IdAllocator();

  /// The id of a declaration, derived from its stable [symbol].
  ///
  /// The symbol must identify the declaration and nothing about its contents — e.g.
  /// `sig:lib/screens/login_screen.dart#_LoginScreenState._email`. Editing the *body* of a method
  /// must not change the id of the signal it writes.
  String forDeclaration(String symbol) => uir.nodeIdOfSymbol(symbol);

  /// The id of a tree node, derived from its canonical content.
  ///
  /// `id`, `anchor` and `span` are stripped **recursively**, from the node and from every node
  /// embedded inside it, before the hash is taken.
  ///
  /// Recursively matters, and it is subtle. A UIR parent embeds its children whole, so a parent's
  /// JSON contains its children's spans. Hashing that would make a parent's id change whenever a
  /// *child* moved — and since a child moves whenever a line is inserted above it, every id in the
  /// file would change on every keystroke. The incremental cache (ADR-5) would never hit, and every
  /// override anchor would be orphaned on every save.
  ///
  /// Stripping recursively is also what makes the id mean what it says: *this subtree, wherever it
  /// is*. Two identical subtrees in different files hash the same, which is exactly the point of
  /// content addressing. Nothing is lost by dropping the children's ids either — a child's id is
  /// itself a function of its stripped content, so it carries no information the hash does not
  /// already have.
  String forContent(Map<String, Object?> content) {
    assert(
      !content.containsKey('id') && !content.containsKey('anchor') && !content.containsKey('span'),
      'content hashed for a NodeId must exclude id, anchor and span (Spec §2.3)',
    );
    // canonicalEncode, not jsonEncode: an id is a hash of the *specified* canonical bytes, not of
    // whatever the host language happens to print (§A15, §A16). Dart writes the double 100.0 as
    // `100.0` and JavaScript writes it as `100` — and a node with two byte-forms has two ids.
    return uir.nodeIdOfContent(content);
  }

  /// Removes `id`, `anchor` and `span` from [value] and from everything inside it.
  ///
  /// Delegates to the **generated** stripper (§A16). The identity check must compare exactly what the
  /// id was computed from, and the only way to guarantee that is for there to be one implementation of
  /// "what the id is computed from" — generated from the schema, into both languages, from one source.
  static Object? stripped(Object? value) => uir.stripIdentity(value);



}
