/// Lexical scopes.
///
/// Layer: `session` (extraction).
///
/// A scope answers one question — *what does this name mean here?* — and it answers it the way Dart
/// does: innermost first, walking outward. Shadowing is not an edge case to be handled; it is the
/// rule, and it falls out of the chain for free.
///
/// **No module-scope mutable state** (ADR-15). A scope is a value: entering one returns a new scope
/// whose parent is the old one, and leaving one is simply letting it go out of the caller's hands.
/// Two files, or two isolates, extracting at once cannot see each other, because there is nothing to
/// see.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:analyzer/dart/element/element.dart';
import 'package:meta/meta.dart';

/// What a name in scope refers to.
enum Binds {
  /// A local variable or a `for`/`catch` binding.
  local,

  /// A parameter of the enclosing function, method, or widget constructor.
  parameter,

  /// An instance field of the enclosing class.
  field,

  /// A reactive field — a signal. Reads of it are reactive reads.
  signal,

  /// A top-level declaration: a class, function, enum, or variable.
  topLevel,

  /// A method of the enclosing class that writes state, and is therefore a `sig.Action`.
  ///
  /// Distinct from [Binds.field] because a reference to it is a reference to a *node* — the action carries a
  /// symbol, and `logic.Ref.target` resolves to it. That is what makes the tear-off
  /// `onDestinationSelected: _select` reach the generator as something it can call, rather than as a bare
  /// name it reports `BRG3006` for.
  action,

  /// A field whose type is a declared store (ADR-27) — `final FavoritesStore _favorites =
  /// FavoritesStore();`. Distinct from [Binds.signal]: the field's *value* is a live store handle, not a
  /// plain reactive value, and its declaration is an `app.StoreInstance`, not a `sig.Signal`.
  storeInstance,
}

/// One binding in a scope.
@immutable
final class Binding {
  /// Creates a binding of [name].
  const Binding({required this.name, required this.binds, this.symbol, this.inlineValue});

  /// The name as written.
  final String name;

  /// What it is.
  final Binds binds;

  /// The symbol it resolves to, when it is something another record can refer to.
  ///
  /// An ordinary local (ADR-28) has one too, despite nothing outside its own function ever naming
  /// it — it is needed *within* the function, by a later reference to the same declaration, and
  /// `Symbols.local`'s owner+ordinal scheme is what keeps two lexically distinct locals from
  /// colliding merely because they look alike (a plain `var`/`for`/`catch` binding does not yet;
  /// ADR-28 §17 scopes this to ordinary `final`/`var` declarations only).
  final String? symbol;

  /// A build-method local's own initializer, substituted at every reference instead of named
  /// (M8-B, "structured build-method extraction").
  ///
  /// `ui.Component.render` has no statement sequence to declare a local in — it is a `ui.*` tree, not a
  /// `logic.Block` — so a reference cannot resolve to a sibling `logic.VarDecl` the way one does inside
  /// an action body. Re-extracting the declaration's own initializer at each use site is what carries the
  /// value into the tree instead, relying on the same invariant Flutter's own framework contract already
  /// requires of `build()`: it is free of externally observable side effects, so evaluating its
  /// expressions more than once (or reordering them relative to a later branch) does not change what the
  /// program renders. `null` for every other binding kind — nothing else needs this.
  final Expression? inlineValue;
}

/// Every ordinary local declaration's ordinal, within one owning body (ADR-28).
///
/// Computed once, by a single pre-order pass over the *whole* body — including nested closures, which
/// share their enclosing body's own numbering (ADR-28 §3) — **before** the main extraction walk begins,
/// and never touched again. This is why it is a plain, immutable `Map`, not a running counter: a local's
/// own `logic.VarDecl` (built once, from `_variable`) and the `Binding` a later reference resolves
/// against (built separately, from `_declaring`, at a different point in the same walk) both need the
/// *same* ordinal for the *same* declaration — a live counter incremented from two different call sites
/// would hand them different answers depending on which one asked first. A pre-computed lookup, keyed by
/// the analyzer's own resolved `Element` (stable and comparable within one compilation, never by name or
/// span), is unambiguous no matter how many times or in what order it is asked.
///
/// Scoped deliberately narrow (ADR-28 §17): only a `VariableDeclaration` that is a direct child of an
/// ordinary `VariableDeclarationStatement` gets one. A `for`-loop-declared variable or a `catch` clause
/// binding is a `VariableDeclaration`/parameter too, syntactically, but neither is numbered here — the
/// same category of gap, measured only for `final`/`var` locals, not yet extended to those.
Map<Element, int> _ordinalsOf(AstNode body) {
  final _OrdinalVisitor visitor = _OrdinalVisitor();
  body.accept(visitor);
  return visitor.ordinals;
}

final class _OrdinalVisitor extends RecursiveAstVisitor<void> {
  final Map<Element, int> ordinals = <Element, int>{};

  @override
  void visitVariableDeclaration(VariableDeclaration node) {
    // `node.parent` is the `VariableDeclarationList`; its own parent distinguishes an ordinary
    // `final x = 1;` (a `VariableDeclarationStatement`) from a `for (var i = 0; ...)` declaration (a
    // `ForPartsWithDeclarations`) — only the former is numbered (ADR-28 §17).
    if (node.parent?.parent is VariableDeclarationStatement) {
      if (node.declaredFragment?.element case final Element element) {
        ordinals[element] = ordinals.length;
      }
    }
    super.visitVariableDeclaration(node);
  }
}

/// A lexical scope: a set of names, and the scope enclosing it.
@immutable
final class Scope {
  const Scope._(this._bindings, this._parent, this._owner, this._ordinals);

  /// The empty scope, enclosing nothing.
  factory Scope.root() => const Scope._(<String, Binding>{}, null, null, null);

  /// A fresh scope for the body of a declaration named [owner] — an action, a top-level function.
  ///
  /// Runs [_ordinalsOf] over [body] once, up front: ordinals are scoped per owning body (ADR-28 §15),
  /// not per file, so editing one method's locals never renumbers another method's. Nested closures
  /// reached from this body reuse the *same* map (they are extracted via ordinary [child]/[withBinding]
  /// calls, which carry [_owner]/[_ordinals] through unchanged) — a closure does not start its own local
  /// numbering, because it is not its own declaration-tier owner.
  factory Scope.forBody(Scope enclosing, {required String owner, required AstNode body}) =>
      Scope._(const <String, Binding>{}, enclosing, owner, _ordinalsOf(body));

  final Map<String, Binding> _bindings;
  final Scope? _parent;

  /// The symbol of the nearest enclosing action/function this scope's locals belong to, or `null`
  /// outside any body (file/class scope, where no local can be declared).
  final String? _owner;
  final Map<Element, int>? _ordinals;

  /// A new scope enclosed by this one, containing [bindings].
  ///
  /// A name in [bindings] shadows the same name outside, which is what `lookup` walking innermost-out
  /// already means. [_owner]/[_ordinals] carry through unchanged — only the body-entry point
  /// ([Scope.forBody]) ever starts a new one.
  Scope child(Iterable<Binding> bindings) => Scope._(
    <String, Binding>{for (final Binding binding in bindings) binding.name: binding},
    this,
    _owner,
    _ordinals,
  );

  /// A new scope enclosed by this one, containing one more name.
  Scope withBinding(Binding binding) => child(<Binding>[binding]);

  /// The symbol of the enclosing body, for minting a local's own symbol — `null` if this scope was
  /// never entered via [Scope.forBody] (there is no enclosing action/function, so no local can be
  /// declared here; a caller that reaches this outside such a body has a bug elsewhere).
  String? get owner => _owner;

  /// [element]'s own ordinal within the enclosing body, precomputed by [Scope.forBody] — `null` if this
  /// scope carries no ordinal map, or if [element] is not one [_ordinalsOf] numbered (a `for`/`catch`
  /// binding, ADR-28 §17).
  int? ordinalOf(Element element) => _ordinals?[element];

  /// What [name] means here, or `null` if it means nothing in scope.
  ///
  /// A `null` is not a failure to be repaired. It means the name is not lexical — it is a type, an
  /// import prefix, a static, an extension member — and the caller decides what to do about it. What
  /// it must not do is guess (INV-4).
  Binding? lookup(String name) {
    for (Scope? scope = this; scope != null; scope = scope._parent) {
      final Binding? found = scope._bindings[name];
      if (found != null) {
        return found;
      }
    }
    return null;
  }
}
