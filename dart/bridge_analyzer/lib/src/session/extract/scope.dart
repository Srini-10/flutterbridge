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
  /// A local has none: nothing outside its function can refer to it, so it needs no identity.
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

/// A lexical scope: a set of names, and the scope enclosing it.
@immutable
final class Scope {
  const Scope._(this._bindings, this._parent);

  /// The empty scope, enclosing nothing.
  factory Scope.root() => const Scope._(<String, Binding>{}, null);

  final Map<String, Binding> _bindings;
  final Scope? _parent;

  /// A new scope enclosed by this one, containing [bindings].
  ///
  /// A name in [bindings] shadows the same name outside, which is what `lookup` walking innermost-out
  /// already means.
  Scope child(Iterable<Binding> bindings) => Scope._(
    <String, Binding>{for (final Binding binding in bindings) binding.name: binding},
    this,
  );

  /// A new scope enclosed by this one, containing one more name.
  Scope withBinding(Binding binding) => child(<Binding>[binding]);

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
