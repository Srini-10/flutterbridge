/// The adapter registry.
///
/// Layer: `session` (adapters).
///
/// Compiled, ordered, and first-match. The set of adapters in a build is a fact about that build:
/// there is no reflection, no plugin loading, no filesystem scan, and no map iteration anywhere in the
/// dispatch path. A registry whose order could differ between two runs is a registry that could make
/// the compiler non-deterministic (D1–D5), which is the one thing it may never be.
///
/// ## First match, and why ambiguity is an error rather than a coin toss
///
/// Adapters are asked in `(priority, name)` order — a **total** order, so it cannot depend on the
/// order they were listed in. The first that claims a construction gets it.
///
/// If two adapters at the **same priority** both claim it, that is not a tie to be broken; it is a bug
/// in the compiler's configuration, and it is reported as `BRG1306`. Silently picking one would mean
/// the meaning of a user's code depends on which adapter was declared first, which is exactly the kind
/// of invisible coupling that makes a compiler impossible to reason about.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/element/type.dart';
import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_context.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_result.dart';
import 'package:bridge_analyzer/src/session/adapters/annotations/default_annotation_adapter.dart';
import 'package:bridge_analyzer/src/session/adapters/route/gorouter_adapter.dart';
import 'package:bridge_analyzer/src/session/adapters/route/material_adapter.dart';
import 'package:bridge_analyzer/src/session/adapters/widget/flutter_adapter.dart';
import 'package:bridge_analyzer/src/session/adapters/widget/gap_adapter.dart';

/// The adapters this build understands.
final class AdapterRegistry {
  /// Creates a registry over [adapters].
  ///
  /// Sorted once, at construction, by `(priority, name)`. Never sorted again, and never iterated in
  /// any other order.
  AdapterRegistry(List<PackageAdapter> adapters)
    : adapters = List<PackageAdapter>.unmodifiable(
        adapters.toList()..sort(_byPriorityThenName),
      );

  /// The adapters this compiler ships with.
  ///
  /// The whole of the compiler's package knowledge, in one list. Adding a package means adding a line
  /// here and a file beside it — and *nothing else*, anywhere.
  factory AdapterRegistry.production() => AdapterRegistry(<PackageAdapter>[
    const GoRouterAdapter(),
    const MaterialRouteAdapter(),
    const FlutterWidgetAdapter(),
    // The first package adapter, and the test of this doc comment's own claim. See `gap_adapter.dart`.
    const GapWidgetAdapter(),
    const DefaultAnnotationAdapter(),
  ]);

  /// Every adapter, in dispatch order.
  final List<PackageAdapter> adapters;

  static int _byPriorityThenName(PackageAdapter a, PackageAdapter b) {
    final int byPriority = a.priority.compareTo(b.priority);
    return byPriority != 0 ? byPriority : a.name.compareTo(b.name);
  }

  /// The routes the construction [node] declares, through whichever adapter claims it.
  ///
  /// Returns an empty list when no adapter claims it — which is the common case: most constructions in
  /// a Flutter application are widgets, not routers.
  List<RouteDeclaration> routesOf(AdapterContext context, InstanceCreationExpression node) {
    final List<RouteAdapter> claiming = <RouteAdapter>[
      for (final PackageAdapter adapter in adapters)
        if (adapter is RouteAdapter && adapter.claimsRoutes(context, node)) adapter,
    ];

    if (claiming.isEmpty) {
      return const <RouteDeclaration>[];
    }

    // Two adapters at the same priority both claiming one declaration is ambiguity, and ambiguity in a
    // compiler is a defect, not a preference. Report it and take the first: the build continues (Spec
    // §8 — extraction never throws), but nobody gets to pretend this was intended.
    if (claiming.length > 1 && claiming[0].priority == claiming[1].priority) {
      context.report(
        Codes.adapterConflict,
        'The adapters `${claiming.map((RouteAdapter a) => a.name).join('`, `')}` all claim this '
        'declaration at the same priority. Which one wins would depend on the order they happen to be '
        'listed in, so the compiler refuses to let that decide what your code means.',
        node,
      );
    }

    return claiming.first.routesOf(context, node);
  }

  /// The navigation the invocation [node] performs, through whichever adapter claims it.
  ///
  /// Returns `null` when no adapter claims it — the overwhelmingly common case, since most method
  /// invocations in an application are not navigations — and also when an adapter claims it but it
  /// carries no edge (a `Navigator.pop()`; Spec v2.4 §A17.3).
  TransitionDeclaration? transitionOf(AdapterContext context, MethodInvocation node) {
    final List<TransitionAdapter> claiming = <TransitionAdapter>[
      for (final PackageAdapter adapter in adapters)
        if (adapter is TransitionAdapter && adapter.claimsTransition(context, node)) adapter,
    ];

    if (claiming.isEmpty) {
      return null;
    }

    // Same rule as `routesOf`, for the same reason: two adapters claiming one call at one priority
    // means the meaning of the user's program would depend on the order of a list in our source.
    if (claiming.length > 1 && claiming[0].priority == claiming[1].priority) {
      context.report(
        Codes.adapterConflict,
        'The adapters `${claiming.map((TransitionAdapter a) => a.name).join('`, `')}` all claim this '
        'navigation at the same priority. Which one wins would depend on the order they happen to be '
        'listed in, so the compiler refuses to let that decide what your code means.',
        node,
      );
    }

    return claiming.first.transitionOf(context, node);
  }

  /// What the widget adapters know about [type].
  ///
  /// Chained deliberately, and it is the one place chaining is allowed: `isWidget` is a question every
  /// widget adapter can answer about its own package, and a `Widget` from `flutter` and one from a
  /// third-party kit are both widgets. First recognition wins; nothing is merged.
  WidgetRecognition recogniseWidget(AdapterContext context, DartType? type) {
    for (final PackageAdapter adapter in adapters) {
      if (adapter is! WidgetAdapter) {
        continue;
      }
      final WidgetRecognition recognition = adapter.recognise(context, type);
      if (recognition.isWidget) {
        return recognition;
      }
    }
    return WidgetRecognition.none;
  }

  /// What the annotation adapters know about [annotation].
  AnnotationRecognition? recogniseAnnotation(AdapterContext context, Annotation annotation) {
    for (final PackageAdapter adapter in adapters) {
      if (adapter is AnnotationAdapter) {
        final AnnotationRecognition? found = adapter.recognise(context, annotation);
        if (found != null) {
          return found;
        }
      }
    }
    return null;
  }

  /// The tokens the construction [node] declares, through whichever adapter claims it.
  List<TokenDeclaration> tokensOf(AdapterContext context, InstanceCreationExpression node) {
    for (final PackageAdapter adapter in adapters) {
      if (adapter is ThemeAdapter && adapter.claimsTheme(context, node)) {
        return adapter.tokensOf(context, node);
      }
    }
    return const <TokenDeclaration>[];
  }

  /// The widget a `State<T>` is the state of.
  String? widgetOfState(DartType? type) {
    for (final WidgetAdapter adapter in widgetAdapters) {
      final String? widget = adapter.widgetOfState(type);
      if (widget != null) {
        return widget;
      }
    }
    return null;
  }

  /// The accessibility [widget]'s own arguments state.
  Map<String, Object?> semanticsOf(String widget, Map<String, Object?> constantArguments) {
    for (final WidgetAdapter adapter in widgetAdapters) {
      final Map<String, Object?> found = adapter.semanticsOf(widget, constantArguments);
      if (found.isNotEmpty) {
        return found;
      }
    }
    return const <String, Object?>{};
  }

  /// The widget adapters, in dispatch order.
  ///
  /// Exposed because the questions the extractor asks about *shape* — is this a slot, is this a
  /// lifecycle method, is this a store base — are per-adapter and must not be merged into one answer.
  Iterable<WidgetAdapter> get widgetAdapters =>
      adapters.whereType<WidgetAdapter>();

  /// Whether any adapter treats [parameter] of [widget] as a named child rather than a prop.
  bool isSlot(String widget, String parameter) =>
      widgetAdapters.any((WidgetAdapter a) => a.isSlot(widget, parameter));

  /// The parameter of [widget] holding an ordered list of children, if it has one.
  String? childrenPropOf(String widget) {
    for (final WidgetAdapter adapter in widgetAdapters) {
      final String? prop = adapter.childrenPropOf(widget);
      if (prop != null) {
        return prop;
      }
    }
    return null;
  }

  /// The name of [widget]'s [index]th positional argument, if any adapter gives it one.
  String? positionalPropOf(String widget, String? constructorName, int index) {
    for (final WidgetAdapter adapter in widgetAdapters) {
      final String? name = adapter.positionalPropOf(widget, constructorName, index);
      if (name != null) {
        return name;
      }
    }
    return null;
  }

  /// The builder parameter of [widget], if any adapter says its only purpose is to scope a rebuild.
  (String builderProp, String? valueProp)? rebuildBuilderOf(String widget) {
    for (final WidgetAdapter adapter in widgetAdapters) {
      final (String, String?)? entry = adapter.rebuildBuilderOf(widget);
      if (entry != null) {
        return entry;
      }
    }
    return null;
  }

  /// The builder and count parameters of [widget]'s [constructorName], if any adapter says it builds its
  /// children lazily.
  ///
  /// First adapter with an answer wins, in priority order — the same rule every other question here uses.
  (String builderProp, String countProp)? lazyBuilderOf(String widget, String? constructorName) {
    for (final WidgetAdapter adapter in widgetAdapters) {
      final (String, String)? entry = adapter.lazyBuilderOf(widget, constructorName);
      if (entry != null) {
        return entry;
      }
    }
    return null;
  }

  /// The fields to read off a constant of [typeName], if any adapter extracts its consts by value.
  List<String>? constValueFieldsOf(String typeName) {
    for (final WidgetAdapter adapter in widgetAdapters) {
      final List<String>? fields = adapter.constValueFieldsOf(typeName);
      if (fields != null) {
        return fields;
      }
    }
    return null;
  }

  /// Lifecycle methods, and the effect timing each one is.
  Map<String, String> get lifecycleMethods => <String, String>{
    for (final WidgetAdapter adapter in widgetAdapters) ...adapter.lifecycleMethods,
  };

  /// Whether [type]'s *value* is state even when the field holding it is `final`.
  bool isStateHolder(DartType? type) =>
      widgetAdapters.any((WidgetAdapter a) => a.isStateHolder(type));

  /// Whether a class extending [type] is a store.
  bool isStoreBase(DartType? type) =>
      widgetAdapters.any((WidgetAdapter a) => a.isStoreBase(type));

  /// The closure a framework state-batching call wraps, if [node] is one (INV-22).
  FunctionExpression? unwrapStateBatch(MethodInvocation node) {
    for (final WidgetAdapter adapter in widgetAdapters) {
      final FunctionExpression? inner = adapter.unwrapStateBatch(node);
      if (inner != null) {
        return inner;
      }
    }
    return null;
  }

  /// Whether [node] is a framework change notification that must be erased (INV-22).
  bool isChangeNotification(MethodInvocation node) =>
      widgetAdapters.any((WidgetAdapter a) => a.isChangeNotification(node));

  /// Whether [node] is the framework getter a `State` uses to reach its own props (INV-22).
  bool isComponentPropsGetter(Expression node) =>
      widgetAdapters.any((WidgetAdapter a) => a.isComponentPropsGetter(node));

  /// Whether [library] is a framework, rather than the application being compiled.
  bool isFrameworkLibrary(String library) =>
      widgetAdapters.any((WidgetAdapter a) => a.isFrameworkLibrary(library));
}
