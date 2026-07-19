// GENERATED CODE — DO NOT EDIT.
//
// Generated from catalog/widgets/gap.json by tools/catalog-codegen.
//
// Framework metadata is authored **once**, in one JSON file, and generated into both language domains
// (ADR-18). A fact stated twice is a fact that will eventually be stated two different ways — and we
// have already paid for that twice: canonical numbers (Dart wrote `100.0`, JavaScript wrote `100`),
// and this catalog itself (a flat slot set in Dart, a per-widget catalog in TypeScript, disagreeing).
//
// To change what the compiler knows about a widget, change the JSON.

/// What a widget fundamentally is, when it is more than a container.
enum WidgetRole {
  /// Its whole purpose is a single text value.
  text,

  /// It renders one of several things depending on an asynchronous value.
  async,
}

/// A constructor whose children come from a builder closure over an index range.
///
/// `ListView.builder(itemCount: n, itemBuilder: (context, i) => W)` says what
/// `for (final x in xs) W(x)` says, in the spelling Flutter chose for large lists. The parameter names
/// are framework metadata — a package with its own lazy list would use its own — so ADR-18 puts them in
/// the catalog rather than in an extractor.
class LazyBuilder {
  /// Creates a lazy-builder entry.
  const LazyBuilder({required this.builderProp, required this.countProp});

  /// The parameter holding the `(BuildContext, int) -> Widget` closure.
  final String builderProp;

  /// The parameter holding the item count.
  final String countProp;
}

/// A widget whose only purpose is to scope a rebuild.
///
/// Flutter needs these because `setState` rebuilds a whole `State`. Under ADR-4 and ADR-20 a signal read
/// *is* the subscription, so the scope a Flutter program stated by hand is what the signal graph computes —
/// and INV-22 requires the wrapper not to survive extraction.
class RebuildBuilder {
  /// Creates an entry.
  const RebuildBuilder({required this.builderProp, this.valueProp});

  /// The parameter holding the builder closure.
  final String builderProp;

  /// The parameter whose listenable binds the builder's *value* parameter, when it has one.
  final String? valueProp;
}

/// One widget's facts.
class WidgetEntry {
  /// Creates an entry.
  const WidgetEntry({
    required this.name,
    this.slots = const <String>{},
    this.childrenProp,
    this.transparentWithoutProps,
    this.role,
    this.positionalProps = const <String, List<String>>{},
  });

  /// The widget's name.
  final String name;

  /// Named parameters holding a **single** child.
  final Set<String> slots;

  /// The parameter holding an **ordered list** of children.
  ///
  /// Often `children` — and *not* always. `CustomScrollView` uses `slivers`; `AppBar` uses `actions`.
  /// Assuming the literal string `children` is how a compiler buries a widget list inside an
  /// expression and loses the UI structure entirely.
  final String? childrenProp;

  /// The widget is a transparent wrapper when **none** of these props is set.
  ///
  /// `null` means never transparent — the safe default. A `Center` with no props still centres.
  final Set<String>? transparentWithoutProps;

  /// What it fundamentally is, if it is more than a container.
  final WidgetRole? role;

  /// Names for the widget's **positional** arguments, keyed by constructor (`''` is the unnamed one).
  ///
  /// A named argument's meaning is its label and a slot's is the catalog's; a positional argument has
  /// neither, and before ADR-0023 reached UIR as `_positional0` — present, typed, uninterpretable.
  /// Keyed by constructor because Flutter names them differently per constructor:
  /// `Image.asset(String name)` against `Image.network(String src)`.
  final Map<String, List<String>> positionalProps;
}

/// The gap catalog.
abstract final class GapCatalog {
  /// The library these widgets come from. Matched as a **prefix**.
  static const String library = 'package:gap/';

  /// Widgets, by name.
  static const Map<String, WidgetEntry> widgets = <String, WidgetEntry>{
  'Gap': WidgetEntry(name: 'Gap', positionalProps: <String, List<String>>{'': <String>['mainAxisExtent']}),
  'SliverGap': WidgetEntry(name: 'SliverGap', positionalProps: <String, List<String>>{'': <String>['mainAxisExtent']}),
  'MaxGap': WidgetEntry(name: 'MaxGap', positionalProps: <String, List<String>>{'': <String>['mainAxisExtent']}),
  };

  /// Base classes a component may extend.
  static const Set<String> componentBases = <String>{};

  /// The base class of the `State` half of a stateful pair.
  static const String stateBase = '';

  /// The getter a `State` uses to reach its `StatefulWidget`'s fields (INV-22).
  ///
  /// `widget.isDark` is a read of the component's own parameter `isDark`; `widget` is the framework's
  /// word for "my own props" and must not survive extraction.
  static const String componentPropsGetter = '';

  /// Types whose *value* is state even when the field holding them is `final`.
  static const Set<String> stateHolders = <String>{};

  /// Base classes whose subclasses are stores: state that outlives any one component.
  static const Set<String> storeBases = <String>{};

  /// Lifecycle methods, and the effect timing each one is.
  static const Map<String, String> lifecycle = <String, String>{

  };

  /// Calls that batch state mutations and mean nothing else — `setState` (INV-22).
  static const Set<String> stateBatchCalls = <String>{};

  /// Framework calls that announce a change and carry no other meaning (INV-22).
  ///
  /// ADR-4/ADR-20: *a signal write **is** the notification*. The announcement is already implied by the
  /// write the UIR records, and the name is one no downstream pass may know.
  static const Set<String> changeNotificationCalls = <String>{};

  /// The classes that own the navigation methods.
  static const Set<String> navigationTypes = <String>{};

  /// Methods taking a Route object: the destination is constructed inline (`RouteTransition.component`).
  static const Set<String> navigationPushRoute = <String>{};

  /// Methods taking a path string: the destination is a declared route (`RouteTransition.target`).
  static const Set<String> navigationPushPath = <String>{};

  /// Methods that return along an edge that already exists. Not transitions (Spec v2.4 §A17.3).
  static const Set<String> navigationPop = <String>{};

  /// The `Route` implementations whose builder produces the destination.
  static const Set<String> navigationRouteTypes = <String>{};

  /// Top-level functions that open a route overlay — a dialog, modal sheet or menu.
  static const Set<String> navigationOverlayOpeners = <String>{};

  /// The parameter of a route type that builds the destination widget.
  static const String navigationBuilderProp = '';

  /// The `RouteSettings` property an `onGenerateRoute` switch selects on.
  static const String navigationSettingsNameProp = '';

  /// Widgets whose only purpose is to scope a rebuild. See [RebuildBuilder].
  static const Map<String, RebuildBuilder> rebuildBuilders = <String, RebuildBuilder>{

  };

  /// Constructors whose children come from a builder closure over an index range, keyed
  /// `Widget.constructor`.
  ///
  /// `ListView.builder(itemCount: n, itemBuilder: (c, i) => W)` says what `for (final x in xs) W(x)`
  /// says, in the spelling Flutter chose for large lists. Extraction expands both into `ui.List`.
  static const Map<String, LazyBuilder> lazyBuilders = <String, LazyBuilder>{

  };

  /// Types whose static consts are extracted as their **value**, and the fields to read off it.
  ///
  /// `Icons.star` is `IconData(0xe5f9, fontFamily: 'MaterialIcons')`. Referencing it by name would
  /// oblige every runtime kit to carry Flutter's ~2000-entry `Icons` table; the codepoint is the icon's
  /// actual identity.
  static const Map<String, List<String>> constValues = <String, List<String>>{

  };

  /// Props that carry an accessibility label on any widget.
  static const Set<String> semanticLabelProps = <String>{};

  /// Widgets that state accessibility through their own arguments.
  static const Map<String, Map<String, Object>> semanticsWidgets = <String, Map<String, Object>>{

  };

  /// Types that declare a theme.
  static const Set<String> themeTypes = <String>{};

  /// The constructor that derives a colour scheme from a seed.
  static const String seedConstructor = '';

  /// The argument carrying that seed.
  static const String seedProp = '';

  /// The argument carrying a theme's brightness.
  static const String brightnessProp = '';

  /// Arguments of a colour scheme that are not Material roles.
  static const Set<String> nonRoleProps = <String>{};
}
