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

/// One widget's facts.
class WidgetEntry {
  /// Creates an entry.
  const WidgetEntry({
    required this.name,
    this.slots = const <String>{},
    this.childrenProp,
    this.transparentWithoutProps,
    this.role,
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
}

/// The material catalog.
abstract final class MaterialCatalog {
  /// The library these widgets come from. Matched as a **prefix**.
  static const String library = 'package:flutter/';

  /// Widgets, by name.
  static const Map<String, WidgetEntry> widgets = <String, WidgetEntry>{
  'Text': WidgetEntry(name: 'Text', role: WidgetRole.text),
  'SelectableText': WidgetEntry(name: 'SelectableText', role: WidgetRole.text),
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
  'MaterialApp': WidgetEntry(name: 'MaterialApp', slots: <String>{'home'}),
  'CupertinoApp': WidgetEntry(name: 'CupertinoApp', slots: <String>{'home'}),
  'WidgetsApp': WidgetEntry(name: 'WidgetsApp', slots: <String>{'home'}),
  'Card': WidgetEntry(name: 'Card', slots: <String>{'child'}),
  'Dismissible': WidgetEntry(name: 'Dismissible', slots: <String>{'child', 'background', 'secondaryBackground'}),
  'FloatingActionButton': WidgetEntry(name: 'FloatingActionButton', slots: <String>{'child', 'icon', 'label'}),
  'ElevatedButton': WidgetEntry(name: 'ElevatedButton', slots: <String>{'child'}),
  'TextButton': WidgetEntry(name: 'TextButton', slots: <String>{'child'}),
  'OutlinedButton': WidgetEntry(name: 'OutlinedButton', slots: <String>{'child'}),
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
  'Form': WidgetEntry(name: 'Form', slots: <String>{'child'}),
  'PopScope': WidgetEntry(name: 'PopScope', slots: <String>{'child'}),
  'ListenableBuilder': WidgetEntry(name: 'ListenableBuilder', slots: <String>{'child'}),
  'ColoredBox': WidgetEntry(name: 'ColoredBox', slots: <String>{'child'}),
  'MergeSemantics': WidgetEntry(name: 'MergeSemantics', slots: <String>{'child'}),
  'Container': WidgetEntry(name: 'Container', slots: <String>{'child'}, transparentWithoutProps: <String>{'alignment', 'clipBehavior', 'color', 'constraints', 'decoration', 'foregroundDecoration', 'height', 'margin', 'padding', 'transform', 'transformAlignment', 'width'}),
  'SizedBox': WidgetEntry(name: 'SizedBox', slots: <String>{'child'}, transparentWithoutProps: <String>{'width', 'height'}),
  'DecoratedBox': WidgetEntry(name: 'DecoratedBox', slots: <String>{'child'}, transparentWithoutProps: <String>{'decoration'}),
  'RepaintBoundary': WidgetEntry(name: 'RepaintBoundary', slots: <String>{'child'}, transparentWithoutProps: <String>{}),
  };

  /// Base classes a component may extend.
  static const Set<String> componentBases = <String>{'StatelessWidget', 'StatefulWidget', 'InheritedWidget', 'ConsumerWidget', 'ConsumerStatefulWidget', 'HookWidget', 'HookConsumerWidget', 'StatefulHookConsumerWidget'};

  /// The base class of the `State` half of a stateful pair.
  static const String stateBase = 'State';

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

  /// The parameter of a route type that builds the destination widget.
  static const String navigationBuilderProp = 'builder';

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
