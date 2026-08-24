/// Route transitions.
///
/// Layer: `session` (extraction).
///
/// **This file contains no package knowledge.** There is no `if (method == 'push')` here: it asks the
/// adapter registry what navigation a call performs, and turns the answer into a record. Adapters know
/// `Navigator.push` and `context.go`; this knows `app.RouteTransition` (ISSUE-16, ADR-18).
///
/// A route transition is the **edge** N11 (`promote-cross-route-state`, ADR-11) is defined over. The
/// route graph had nodes and no edges until this ran: the analyzer emitted `app.Route` declarations
/// but never a transition, so N11 had nothing to promote across and no generator could emit navigation.
/// This is the consumer that closes that gap — the recognition side (`TransitionAdapter.transitionOf`)
/// has existed since the v2.4 §A17 groundwork; nothing turned its answers into records.
///
/// ## Where a navigation is found, and why here rather than on a separate walk
///
/// Routes and tokens are collected by a standalone visitor because they are declarations, resolvable
/// from a construction alone. A transition's **arguments** are not: `HomeScreen(isDark: _isDark)` binds
/// `_isDark` to a signal only if the scope says `_isDark` is one, and that scope exists only during the
/// scoped walk of the method the navigation sits in. So transition extraction hangs off the expression
/// extractor — every navigation is a `MethodInvocation`, and every `MethodInvocation` passes through it
/// with its scope in hand.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_context.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_registry.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_result.dart';
import 'package:bridge_analyzer/src/session/extract/binding_extractor.dart';
import 'package:bridge_analyzer/src/session/extract/raw_node_emitter.dart';
import 'package:bridge_analyzer/src/session/extract/scope.dart';
import 'package:bridge_analyzer/src/session/extract/widget_extractor.dart';

/// Turns the navigations adapters find into `app.RouteTransition` records.
final class TransitionExtractor {
  /// Creates an extractor.
  TransitionExtractor(this.out, this.registry, this.context, this.bindings);

  /// The record factory.
  final RawNodeEmitter out;

  /// The compiler's package knowledge — all of it.
  final AdapterRegistry registry;

  /// What the adapters run in.
  final AdapterContext context;

  /// For extracting an inline destination's own widget tree (M9-D) — the same mechanism a normal
  /// `build()` render tree already uses. Wired after construction, like `expressions.transitions`
  /// (`extractor.dart`): `WidgetExtractor` needs the annotation extractor, which is built after this
  /// one, so neither can construct the other first.
  late final WidgetExtractor widgets;

  /// For turning an argument's value expression into a `bind.*`.
  final BindingExtractor bindings;

  /// The component the navigation currently being extracted happens from — the transition's `source`.
  ///
  /// Set by the component extractor at the top of each component and cleared after, so a navigation in
  /// a component's action body or build tree records where it happens, and a navigation in a top-level
  /// function — which has no component — records no source rather than the previous component's.
  String? enclosingComponent;

  /// The transition whose own `inline` destination is currently being extracted, if any (M9-E, ADR-0025
  /// amendment `0025-amendment-dialog-dismissal-scope.md`).
  ///
  /// Set to this transition's own symbol for the exact duration of `_destination()`'s own
  /// `widgets.extract(widget, scope)` call, and reset to `null` immediately after — the same "settable
  /// before, reset after" idiom [enclosingComponent] already uses. Read by `StatementExtractor.navigateOf`
  /// (via `expressions.transitions`) so that **every** `Navigator.pop`/`maybePop` found anywhere inside
  /// that one dialog's own extracted subtree — however deeply nested, in whatever closure, regardless of
  /// which `BuildContext` expression is written — is tagged `dismisses: <this transition>`, without
  /// needing to resolve *which* context was passed. Investigation found that identity unresolvable (a
  /// `showDialog` builder's own parameter is never bound into `Scope` at all — the closure itself is
  /// discarded by `MaterialRouteAdapter._returned()` before extraction ever sees it) and, separately,
  /// unnecessary (real Flutter navigator-resolution semantics mean *any* pop reached synchronously from
  /// inside a dialog's own action dismisses that dialog under the default navigator configuration,
  /// regardless of which context variable was used — verified with a real `flutter_test` widget test, not
  /// assumed).
  String? presentingTransition;

  /// Navigation call sites already turned into a transition, by AST identity, and the symbol each got.
  ///
  /// One call site is one edge. A method's body can be walked more than once — a `build` that both
  /// renders and (because a callback it creates writes a signal) reads as an action is walked as each —
  /// and the same `Navigator.push` node would then reach here twice. It is the *same* navigation, so it
  /// is the *same* edge: the second offer emits nothing further and returns what the first one minted.
  ///
  /// A `Set` sufficed while the answer was "already done"; M7-B made the answer "and here is what that
  /// edge is called". The value is null for a **path** destination, which gets no symbol — so membership
  /// and symbol are two different facts and this is read with `containsKey`. Treating a null value as
  /// absent re-emitted every path transition on the second walk, which is a duplicate edge in the nav
  /// graph, and five tests caught it.
  final Map<MethodInvocation, String?> _seen = Map<MethodInvocation, String?>.identity();

  /// How many transitions this file has produced, and so the next one's ordinal.
  int _ordinal = 0;

  /// Emits a transition for [node] if any adapter recognises it as a navigation.
  ///
  /// Called for every `MethodInvocation` during the scoped walk; the overwhelming majority are not
  /// navigations, and for them `transitionOf` returns null and this does nothing. A recognised
  /// navigation that carries no edge — a `Navigator.pop()` — also returns null and is not a node
  /// (§A17.3).
  String? maybeExtract(MethodInvocation node, Scope scope) {
    // Already extracted on an earlier walk of the same method: one call site is one edge, so this
    // returns the symbol the first walk minted rather than emitting a second node. Checked with
    // `containsKey`, because a path destination is recorded with a null symbol and is still extracted.
    if (_seen.containsKey(node)) {
      return _seen[node];
    }

    final TransitionDeclaration? declaration = registry.transitionOf(context, node);
    if (declaration == null) {
      return null;
    }

    // Exactly one of the three destinations, mirroring the schema (§A17, amended M9-D). The adapter's
    // own constructors make the path/widget half exclusive — `toPath` sets `path`, `toWidget` sets
    // `widget` — so this reads whichever one it set; which of `component`/`inline` a widget destination
    // becomes is decided here, by whether it resolves to a project-declared component.
    final ({String field, RawValue? value, Expression? pendingWidget})? destination = _destination(
      declaration,
      scope,
    );
    if (destination == null) {
      // The inline destination is not a component this project declares (an inline `Container`, a
      // widget from a package). It was reported where that was discovered; there is no edge to emit —
      // and so no symbol, which is what makes the caller keep its refusal rather than name an edge that
      // does not exist.
      return null;
    }
    final bool toRoute = declaration.path != null;

    // ── the edge's identity (M7-B) ────────────────────────────────────────────────────────────────
    //
    // Minted here because here is the first place an edge exists — **and only for a destination whose
    // node is certain to survive the build.**
    //
    // A symbol is the builder's word for *a declaration*, and `BRG1207` enforces that every symbol a
    // pass declares corresponds to a node that survived it. It sweeps all of them, so an unreferenced
    // one trips it too. A transition is not a declaration, and a **path** destination is not certain: a
    // `RawRouteRef` resolves against the route table, and a path matching no route drops the edge with
    // `BRG1308` — a warning by design, because there the program rather than the compiler is at fault.
    // Minting a symbol for an edge that then drops turns that warning into a build error.
    //
    // A **component** destination cannot drop: it is a `RawRef` to a `ui.Component`, a real declaration,
    // and `_destination` has already returned null for anything that does not resolve to one.
    //
    // Closing the path case looks like it needs a *conditional declaration* in the builder — a symbol
    // whose node may legitimately not survive, exempt from the BRG1207 sweep, and whose references drop
    // their owner instead of dangling. **That was built and measured, and it is not enough** (M7-C §8).
    //
    // It works: the exemption removes the transition's own BRG1207 and the drop prevents a dangling
    // NodeId. But dropping the departure is not a local operation — `node_factory._value` propagates
    // `_unresolved` to the owner, transitively, so the departure takes its element and its **component**
    // with it. The screen is then an ordinary declaration with no surviving node, which is BRG1207 all
    // over again, and the warning has become a build failure with an empty program.
    //
    // Exempting *that* would mean declaring a `ui.Component` may legitimately vanish, which is a far
    // larger weakening of BRG1207 than the case deserves. The real decision is upstream: either an
    // unresolved path is an error rather than a warning, or a departure gains a representable form for
    // a path it could not resolve. Both are spec decisions and neither is improvised here.
    final int ordinal = _ordinal++;
    final String? symbol = toRoute ? null : out.symbols.navigation(ordinal);
    _seen[node] = symbol;

    // The inline destination's own widget tree is extracted here, now that a symbol exists for it to be
    // tagged with (M9-E) — `_destination` deferred exactly this, leaving `pendingWidget` unextracted. Set
    // for the whole call so every `Navigator.pop` the subtree contains, at any depth, is tagged.
    //
    // Restored to the *previous* value afterward, not unconditionally to `null` — a dialog action that
    // opens a second dialog (nested; not otherwise supported, §"what this amendment does not decide")
    // would otherwise leave `presentingTransition` clobbered to `null` once the inner call returns, so a
    // later pop in the *outer* dialog's own action — still lexically inside it — would wrongly stop being
    // tagged. Saving/restoring costs nothing and avoids that silent-wrong outcome even though nested
    // dialogs are not a shape this milestone builds or tests for.
    final RawValue destinationValue;
    if (destination.pendingWidget != null) {
      final String? outerPresenting = presentingTransition;
      presentingTransition = symbol;
      try {
        destinationValue = RawChild(widgets.extract(destination.pendingWidget!, scope));
      } finally {
        presentingTransition = outerPresenting;
      }
    } else {
      destinationValue = destination.value!;
    }

    out.emit(
      RawNode(
        kind: 'app.RouteTransition',
        symbol: symbol,
        span: out.span(declaration.at),
        // An `inline` destination (M9-D) embeds a widget subtree (`inline`, `RawChild`) the same way
        // `ui.Component`'s own `render` does, and needs the same thing `ui.Component` already gets from
        // `component_extractor.dart` (`anchorSegment: name`): a private anchor namespace. Without one,
        // two structurally identical dialogs — two `showDialog` calls in one file, each building
        // `AlertDialog(title: Text(...), ...)` — both claim the bare anchor
        // `lib/main.dart#AlertDialog/title:Text` and trip BRG1205 ("two nodes claim the anchor"), because
        // an unset `anchorSegment` here leaves the anchor path exactly as empty as it started, and a
        // fresh, empty anchor path is what "this is a root" means to `node_factory.dart`. A `target`/
        // `component` destination embeds no subtree, so it needs no such namespace.
        anchorSegment: destination.field == 'inline' ? 'transition[$ordinal]' : null,
        fields: <String, RawValue>{
          destination.field: destinationValue,
          // `arguments` names constructor parameters crossing to a *separate* destination — the shape
          // N11 (ADR-11) promotes across a route boundary. An `inline` destination has no such boundary:
          // its own values are already embedded directly in the tree `inline` carries (M9-D), so
          // recording them again here would offer N11 a promotion that does not correspond to any real
          // prop interface — nothing receives a promoted value, because nothing is generated separately.
          if (destination.field != 'inline')
            if (_arguments(declaration.arguments, scope) case final List<RawValue> args
                when args.isNotEmpty)
              'arguments': RawList(args),
          if (enclosingComponent != null) 'source': RawRef(enclosingComponent!),
        },
      ),
    );
    return symbol;
  }

  /// The transition's destination: a route named by path, a project component constructed inline, or —
  /// M9-D — an inline widget tree, for a destination that does not resolve to a project component.
  ///
  /// Returns null only when nothing here is legal to point at (§A17.5). A path always yields a
  /// `RawRouteRef`; whether that path names a route the program declares is the builder's question,
  /// answered against the whole route table (§A17), and an unmatched path is `BRG1308` there rather
  /// than a guess here.
  ///
  /// For an inline destination, `value` is left null and `pendingWidget` carries the still-unextracted
  /// widget expression instead (M9-E) — extraction is deferred to the caller, which by then has minted
  /// this transition's own symbol and can set [presentingTransition] around the `widgets.extract` call, so
  /// every `Navigator.pop` this dialog's own subtree contains is tagged `dismisses: <this transition>`
  /// (`0025-amendment-dialog-dismissal-scope.md`). Extracting eagerly here, before a symbol exists, would
  /// leave no identity to tag the pop with.
  ({String field, RawValue? value, Expression? pendingWidget})? _destination(
    TransitionDeclaration declaration,
    Scope scope,
  ) {
    final String? path = declaration.path;
    if (path != null) {
      return (field: 'target', value: RawRouteRef(path), pendingWidget: null);
    }

    final Expression widget = declaration.widget!;
    // A construction names its component by its *type*, resolved to the library that declares it — the
    // same resolution `app.Route.component` uses, and the only reliable one: a route in `main.dart`
    // naming a component `home_screen.dart` declares must resolve to *that* file's symbol (M1-T8).
    if (widget is! InstanceCreationExpression) {
      out.report(
        Codes.unsupportedWrapper,
        'This navigation constructs its destination with something other than a widget constructor, so '
        'the component it renders cannot be resolved. The edge is left out of the route graph rather '
        'than guessed at.',
        widget,
      );
      return null;
    }

    final String name = widget.constructorName.type.name.lexeme;
    final String? symbol = out.componentSymbolOf(widget.staticType, name);
    if (symbol != null) {
      return (field: 'component', value: RawRef(symbol), pendingWidget: null);
    }

    // Not a component the project declares — a route overlay whose destination is a framework widget,
    // `showDialog(builder: (_) => AlertDialog(...))` being the evidenced shape (M8-X, M9-D). Extracted
    // as an ordinary widget tree, the identical mechanism a normal `build()` render tree already uses
    // (`WidgetExtractor`, the material catalog under ADR-18) — `AlertDialog` needed a catalog entry
    // (title/content slots, an `actions` child list), not new extraction logic. Embedded directly
    // (`inline`), not referenced: there is no declaration for a `RawRef` to name, so inventing a symbol
    // would be exactly the dangling reference (BRG1201) the component branch above refuses.
    return (field: 'inline', value: null, pendingWidget: widget);
  }

  /// The arguments the navigation carries, each as `{name, transport, binding}`.
  ///
  /// The binding is classified in [scope] exactly as any other value is — a literal is `bind.Const`, a
  /// signal read is `bind.Signal`, a widget prop is `bind.Param` — which is what lets N11 tell a
  /// primitive that crosses a URL fine from a signal that must be promoted out of the component.
  ///
  /// `transport` is `primitive` on emit: the analyzer records the value as bound, and N11 is the pass
  /// that decides what becomes of it across the boundary (ADR-11). An argument whose value has no UIR
  /// representation is **omitted, not serialized as Dart source** — the expression extractor has
  /// already reported it (BRG1302), and a route argument that is an opaque string is one a generator
  /// could not pass to anything.
  List<RawValue> _arguments(List<TransitionArgument> arguments, Scope scope) {
    final List<RawValue> out = <RawValue>[];
    for (final TransitionArgument argument in arguments) {
      final RawNode binding = bindings.extract(argument.value, scope);
      if (BindingExtractor.isOpaque(binding)) {
        continue;
      }
      out.add(
        RawMap(<String, RawValue>{
          'name': RawLiteral(argument.name),
          'transport': const RawLiteral('primitive'),
          'binding': RawChild(binding),
        }),
      );
    }
    return out;
  }
}
