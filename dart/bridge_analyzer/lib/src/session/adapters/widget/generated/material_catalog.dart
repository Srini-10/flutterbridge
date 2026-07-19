// GENERATED CODE — DO NOT EDIT.
//
// Generated from catalog/widgets/material.json by tools/catalog-codegen.
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

/// The material catalog.
abstract final class MaterialCatalog {
  /// The library these widgets come from. Matched as a **prefix**.
  static const String library = 'package:flutter/';

  /// Widgets, by name.
  static const Map<String, WidgetEntry> widgets = <String, WidgetEntry>{
  'Text': WidgetEntry(name: 'Text', role: WidgetRole.text, positionalProps: <String, List<String>>{'': <String>['data']}),
  'SelectableText': WidgetEntry(name: 'SelectableText', positionalProps: <String, List<String>>{'': <String>['data']}),
  'FutureBuilder': WidgetEntry(name: 'FutureBuilder', role: WidgetRole.async),
  'StreamBuilder': WidgetEntry(name: 'StreamBuilder', role: WidgetRole.async),
  'Column': WidgetEntry(name: 'Column', childrenProp: 'children'),
  'Row': WidgetEntry(name: 'Row', childrenProp: 'children'),
  'Stack': WidgetEntry(name: 'Stack', childrenProp: 'children'),
  'Wrap': WidgetEntry(name: 'Wrap', childrenProp: 'children'),
  'Flex': WidgetEntry(name: 'Flex', childrenProp: 'children'),
  'ListView': WidgetEntry(name: 'ListView', childrenProp: 'children'),
  'GridView': WidgetEntry(name: 'GridView', childrenProp: 'children'),
  'ListBody': WidgetEntry(name: 'ListBody', childrenProp: 'children'),
  'ButtonBar': WidgetEntry(name: 'ButtonBar', childrenProp: 'children'),
  'OverflowBar': WidgetEntry(name: 'OverflowBar', childrenProp: 'children'),
  'TabBarView': WidgetEntry(name: 'TabBarView', childrenProp: 'children'),
  'PageView': WidgetEntry(name: 'PageView', childrenProp: 'children'),
  'Table': WidgetEntry(name: 'Table', childrenProp: 'children'),
  'CustomScrollView': WidgetEntry(name: 'CustomScrollView', childrenProp: 'slivers'),
  'SliverList': WidgetEntry(name: 'SliverList', childrenProp: 'children'),
  'MultiSliver': WidgetEntry(name: 'MultiSliver', childrenProp: 'children'),
  'AppBar': WidgetEntry(name: 'AppBar', slots: <String>{'title', 'leading', 'flexibleSpace', 'bottom'}, childrenProp: 'actions'),
  'SliverAppBar': WidgetEntry(name: 'SliverAppBar', slots: <String>{'title', 'leading', 'flexibleSpace', 'bottom'}, childrenProp: 'actions'),
  'Scaffold': WidgetEntry(name: 'Scaffold', slots: <String>{'appBar', 'body', 'bottomNavigationBar', 'bottomSheet', 'drawer', 'endDrawer', 'floatingActionButton'}, childrenProp: 'persistentFooterButtons'),
  'ListTile': WidgetEntry(name: 'ListTile', slots: <String>{'leading', 'title', 'subtitle', 'trailing'}),
  'Image': WidgetEntry(name: 'Image', positionalProps: <String, List<String>>{'asset': <String>['name'], 'network': <String>['src']}),
  'Icon': WidgetEntry(name: 'Icon', positionalProps: <String, List<String>>{'': <String>['icon']}),
  'ConstrainedBox': WidgetEntry(name: 'ConstrainedBox', slots: <String>{'child'}),
  'FractionallySizedBox': WidgetEntry(name: 'FractionallySizedBox', slots: <String>{'child'}),
  'ClipRect': WidgetEntry(name: 'ClipRect', slots: <String>{'child'}),
  'Chip': WidgetEntry(name: 'Chip', slots: <String>{'label', 'avatar', 'deleteIcon'}),
  'CircleAvatar': WidgetEntry(name: 'CircleAvatar', slots: <String>{'child'}),
  'Badge': WidgetEntry(name: 'Badge', slots: <String>{'child', 'label'}),
  'LinearProgressIndicator': WidgetEntry(name: 'LinearProgressIndicator'),
  'CircularProgressIndicator': WidgetEntry(name: 'CircularProgressIndicator'),
  'RichText': WidgetEntry(name: 'RichText'),
  'Tooltip': WidgetEntry(name: 'Tooltip', slots: <String>{'child'}),
  'MaterialApp': WidgetEntry(name: 'MaterialApp', slots: <String>{'home'}),
  'CupertinoApp': WidgetEntry(name: 'CupertinoApp', slots: <String>{'home'}),
  'WidgetsApp': WidgetEntry(name: 'WidgetsApp', slots: <String>{'home'}),
  'Card': WidgetEntry(name: 'Card', slots: <String>{'child'}),
  'Dismissible': WidgetEntry(name: 'Dismissible', slots: <String>{'child', 'background', 'secondaryBackground'}),
  'FloatingActionButton': WidgetEntry(name: 'FloatingActionButton', slots: <String>{'child', 'icon', 'label'}),
  'ElevatedButton': WidgetEntry(name: 'ElevatedButton', slots: <String>{'child', 'icon', 'label'}),
  'TextButton': WidgetEntry(name: 'TextButton', slots: <String>{'child', 'icon', 'label'}),
  'OutlinedButton': WidgetEntry(name: 'OutlinedButton', slots: <String>{'child', 'icon', 'label'}),
  'IconButton': WidgetEntry(name: 'IconButton', slots: <String>{'icon'}),
  'Center': WidgetEntry(name: 'Center', slots: <String>{'child'}),
  'Align': WidgetEntry(name: 'Align', slots: <String>{'child'}),
  'Padding': WidgetEntry(name: 'Padding', slots: <String>{'child'}),
  'Expanded': WidgetEntry(name: 'Expanded', slots: <String>{'child'}),
  'Flexible': WidgetEntry(name: 'Flexible', slots: <String>{'child'}),
  'Positioned': WidgetEntry(name: 'Positioned', slots: <String>{'child'}),
  'SafeArea': WidgetEntry(name: 'SafeArea', slots: <String>{'child'}),
  'AspectRatio': WidgetEntry(name: 'AspectRatio', slots: <String>{'child'}),
  'FittedBox': WidgetEntry(name: 'FittedBox', slots: <String>{'child'}),
  'ClipRRect': WidgetEntry(name: 'ClipRRect', slots: <String>{'child'}),
  'Opacity': WidgetEntry(name: 'Opacity', slots: <String>{'child'}),
  'Transform': WidgetEntry(name: 'Transform', slots: <String>{'child'}),
  'GestureDetector': WidgetEntry(name: 'GestureDetector', slots: <String>{'child'}),
  'InkWell': WidgetEntry(name: 'InkWell', slots: <String>{'child'}),
  'Semantics': WidgetEntry(name: 'Semantics', slots: <String>{'child'}),
  'SingleChildScrollView': WidgetEntry(name: 'SingleChildScrollView', slots: <String>{'child'}),
  'TextField': WidgetEntry(name: 'TextField'),
  'TextFormField': WidgetEntry(name: 'TextFormField'),
  'FormField': WidgetEntry(name: 'FormField'),
  'Checkbox': WidgetEntry(name: 'Checkbox'),
  'Switch': WidgetEntry(name: 'Switch'),
  'Radio': WidgetEntry(name: 'Radio'),
  'Slider': WidgetEntry(name: 'Slider'),
  'InputDecorator': WidgetEntry(name: 'InputDecorator', slots: <String>{'child'}),
  'Form': WidgetEntry(name: 'Form', slots: <String>{'child'}),
  'PopScope': WidgetEntry(name: 'PopScope', slots: <String>{'child'}),
  'ListenableBuilder': WidgetEntry(name: 'ListenableBuilder', slots: <String>{'child'}),
  'ColoredBox': WidgetEntry(name: 'ColoredBox', slots: <String>{'child'}),
  'MergeSemantics': WidgetEntry(name: 'MergeSemantics', slots: <String>{'child'}),
  'Container': WidgetEntry(name: 'Container', slots: <String>{'child'}, transparentWithoutProps: <String>{'alignment', 'clipBehavior', 'color', 'constraints', 'decoration', 'foregroundDecoration', 'height', 'margin', 'padding', 'transform', 'transformAlignment', 'width'}),
  'SizedBox': WidgetEntry(name: 'SizedBox', slots: <String>{'child'}, transparentWithoutProps: <String>{'width', 'height'}),
  'DecoratedBox': WidgetEntry(name: 'DecoratedBox', slots: <String>{'child'}, transparentWithoutProps: <String>{'decoration'}),
  'RepaintBoundary': WidgetEntry(name: 'RepaintBoundary', slots: <String>{'child'}, transparentWithoutProps: <String>{}),
  'Drawer': WidgetEntry(name: 'Drawer', slots: <String>{'child'}),
  'NavigationDrawer': WidgetEntry(name: 'NavigationDrawer', childrenProp: 'children'),
  'NavigationDrawerDestination': WidgetEntry(name: 'NavigationDrawerDestination', slots: <String>{'icon', 'selectedIcon', 'label'}),
  'DrawerHeader': WidgetEntry(name: 'DrawerHeader', slots: <String>{'child'}),
  'NavigationBar': WidgetEntry(name: 'NavigationBar', childrenProp: 'destinations'),
  'NavigationDestination': WidgetEntry(name: 'NavigationDestination', slots: <String>{'icon', 'selectedIcon'}),
  'NavigationRail': WidgetEntry(name: 'NavigationRail', slots: <String>{'leading', 'trailing'}, childrenProp: 'destinations'),
  'NavigationRailDestination': WidgetEntry(name: 'NavigationRailDestination', slots: <String>{'icon', 'selectedIcon', 'label'}),
  'BottomNavigationBar': WidgetEntry(name: 'BottomNavigationBar', childrenProp: 'items'),
  'BottomNavigationBarItem': WidgetEntry(name: 'BottomNavigationBarItem', slots: <String>{'icon', 'activeIcon'}),
  'PreferredSize': WidgetEntry(name: 'PreferredSize', slots: <String>{'child'}),
  'BottomAppBar': WidgetEntry(name: 'BottomAppBar', slots: <String>{'child'}),
  'MaterialBanner': WidgetEntry(name: 'MaterialBanner', slots: <String>{'content', 'leading'}, childrenProp: 'actions'),
  'IntrinsicHeight': WidgetEntry(name: 'IntrinsicHeight', slots: <String>{'child'}),
  'IntrinsicWidth': WidgetEntry(name: 'IntrinsicWidth', slots: <String>{'child'}),
  'OverflowBox': WidgetEntry(name: 'OverflowBox', slots: <String>{'child'}),
  'Baseline': WidgetEntry(name: 'Baseline', slots: <String>{'child'}),
  'SnackBar': WidgetEntry(name: 'SnackBar', slots: <String>{'content', 'action'}),
  'TabBar': WidgetEntry(name: 'TabBar', childrenProp: 'tabs'),
  'Tab': WidgetEntry(name: 'Tab', slots: <String>{'icon', 'child'}),
  'AnimatedOpacity': WidgetEntry(name: 'AnimatedOpacity', slots: <String>{'child'}),
  'AnimatedContainer': WidgetEntry(name: 'AnimatedContainer', slots: <String>{'child'}),
  'AnimatedAlign': WidgetEntry(name: 'AnimatedAlign', slots: <String>{'child'}),
  'AnimatedPadding': WidgetEntry(name: 'AnimatedPadding', slots: <String>{'child'}),
  'AnimatedSwitcher': WidgetEntry(name: 'AnimatedSwitcher', slots: <String>{'child'}),
  'Hero': WidgetEntry(name: 'Hero', slots: <String>{'child'}),
  'ExpansionTile': WidgetEntry(name: 'ExpansionTile', slots: <String>{'title', 'subtitle', 'leading', 'trailing'}, childrenProp: 'children'),
  'DefaultTabController': WidgetEntry(name: 'DefaultTabController', slots: <String>{'child'}),
  'ChoiceChip': WidgetEntry(name: 'ChoiceChip', slots: <String>{'label', 'avatar'}),
  'FilterChip': WidgetEntry(name: 'FilterChip', slots: <String>{'label', 'avatar'}),
  'ActionChip': WidgetEntry(name: 'ActionChip', slots: <String>{'label', 'avatar'}),
  'ToggleButtons': WidgetEntry(name: 'ToggleButtons', childrenProp: 'children'),
  'SegmentedButton': WidgetEntry(name: 'SegmentedButton', childrenProp: 'segments'),
  'ButtonSegment': WidgetEntry(name: 'ButtonSegment', slots: <String>{'label', 'icon'}),
  'ReorderableListView': WidgetEntry(name: 'ReorderableListView', childrenProp: 'children'),
  'DataTable': WidgetEntry(name: 'DataTable'),
  'FadeInImage': WidgetEntry(name: 'FadeInImage'),
  'FilledButton': WidgetEntry(name: 'FilledButton', slots: <String>{'child', 'icon', 'label'}),
  };

  /// Base classes a component may extend.
  static const Set<String> componentBases = <String>{'StatelessWidget', 'StatefulWidget', 'InheritedWidget', 'ConsumerWidget', 'ConsumerStatefulWidget', 'HookWidget', 'HookConsumerWidget', 'StatefulHookConsumerWidget'};

  /// The base class of the `State` half of a stateful pair.
  static const String stateBase = 'State';

  /// The getter a `State` uses to reach its `StatefulWidget`'s fields (INV-22).
  ///
  /// `widget.isDark` is a read of the component's own parameter `isDark`; `widget` is the framework's
  /// word for "my own props" and must not survive extraction.
  static const String componentPropsGetter = 'widget';

  /// Types whose *value* is state even when the field holding them is `final`.
  static const Set<String> stateHolders = <String>{'AnimationController', 'ChangeNotifier', 'ScrollController', 'TextEditingController', 'ValueNotifier'};

  /// Base classes whose subclasses are stores: state that outlives any one component.
  static const Set<String> storeBases = <String>{'ChangeNotifier', 'Notifier', 'StateNotifier'};

  /// Lifecycle methods, and the effect timing each one is.
  static const Map<String, String> lifecycle = <String, String>{
  'initState': 'mount',
  'didUpdateWidget': 'update',
  'didChangeDependencies': 'update',
  'dispose': 'unmount',
  };

  /// Calls that batch state mutations and mean nothing else — `setState` (INV-22).
  static const Set<String> stateBatchCalls = <String>{'setState'};

  /// Framework calls that announce a change and carry no other meaning (INV-22).
  ///
  /// ADR-4/ADR-20: *a signal write **is** the notification*. The announcement is already implied by the
  /// write the UIR records, and the name is one no downstream pass may know.
  static const Set<String> changeNotificationCalls = <String>{'notifyListeners'};

  /// The classes that own the navigation methods.
  static const Set<String> navigationTypes = <String>{'Navigator', 'NavigatorState'};

  /// Methods taking a Route object: the destination is constructed inline (`RouteTransition.component`).
  static const Set<String> navigationPushRoute = <String>{'push', 'pushReplacement', 'pushAndRemoveUntil'};

  /// Methods taking a path string: the destination is a declared route (`RouteTransition.target`).
  static const Set<String> navigationPushPath = <String>{'pushNamed', 'pushReplacementNamed', 'pushNamedAndRemoveUntil', 'popAndPushNamed'};

  /// Methods that return along an edge that already exists. Not transitions (Spec v2.4 §A17.3).
  static const Set<String> navigationPop = <String>{'pop', 'maybePop', 'popUntil'};

  /// The `Route` implementations whose builder produces the destination.
  static const Set<String> navigationRouteTypes = <String>{'MaterialPageRoute', 'CupertinoPageRoute', 'PageRouteBuilder'};

  /// Top-level functions that open a route overlay — a dialog, modal sheet or menu.
  static const Set<String> navigationOverlayOpeners = <String>{'showDialog', 'showModalBottomSheet', 'showGeneralDialog', 'showMenu'};

  /// The parameter of a route type that builds the destination widget.
  static const String navigationBuilderProp = 'builder';

  /// The `RouteSettings` property an `onGenerateRoute` switch selects on.
  static const String navigationSettingsNameProp = 'name';

  /// Widgets whose only purpose is to scope a rebuild. See [RebuildBuilder].
  static const Map<String, RebuildBuilder> rebuildBuilders = <String, RebuildBuilder>{
  'Builder': RebuildBuilder(builderProp: 'builder'),
  'ListenableBuilder': RebuildBuilder(builderProp: 'builder'),
  'ValueListenableBuilder': RebuildBuilder(builderProp: 'builder', valueProp: 'valueListenable'),
  };

  /// Constructors whose children come from a builder closure over an index range, keyed
  /// `Widget.constructor`.
  ///
  /// `ListView.builder(itemCount: n, itemBuilder: (c, i) => W)` says what `for (final x in xs) W(x)`
  /// says, in the spelling Flutter chose for large lists. Extraction expands both into `ui.List`.
  static const Map<String, LazyBuilder> lazyBuilders = <String, LazyBuilder>{
  'GridView.builder': LazyBuilder(builderProp: 'itemBuilder', countProp: 'itemCount'),
  'ListView.builder': LazyBuilder(builderProp: 'itemBuilder', countProp: 'itemCount'),
  'PageView.builder': LazyBuilder(builderProp: 'itemBuilder', countProp: 'itemCount'),
  };

  /// Types whose static consts are extracted as their **value**, and the fields to read off it.
  ///
  /// `Icons.star` is `IconData(0xe5f9, fontFamily: 'MaterialIcons')`. Referencing it by name would
  /// oblige every runtime kit to carry Flutter's ~2000-entry `Icons` table; the codepoint is the icon's
  /// actual identity.
  static const Map<String, List<String>> constValues = <String, List<String>>{
  'IconData': <String>['codePoint', 'fontFamily', 'fontPackage'],
  };

  /// Props that carry an accessibility label on any widget.
  static const Set<String> semanticLabelProps = <String>{'semanticLabel'};

  /// Widgets that state accessibility through their own arguments.
  static const Map<String, Map<String, Object>> semanticsWidgets = <String, Map<String, Object>>{
  'Semantics': <String, Object>{'label': 'label', 'hint': 'hint', 'excluded': 'excludeSemantics'},
  'ExcludeSemantics': <String, Object>{'alwaysExcluded': true},
  };

  /// Types that declare a theme.
  static const Set<String> themeTypes = <String>{'ThemeData', 'ColorScheme'};

  /// The constructor that derives a colour scheme from a seed.
  static const String seedConstructor = 'fromSeed';

  /// The argument carrying that seed.
  static const String seedProp = 'seedColor';

  /// The argument carrying a theme's brightness.
  static const String brightnessProp = 'brightness';

  /// Arguments of a colour scheme that are not Material roles.
  static const Set<String> nonRoleProps = <String>{'brightness', 'seedColor', 'dynamicSchemeVariant'};
}
