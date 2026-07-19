/// The `gap` package.
///
/// Layer: `session` (adapters).
///
/// ## Why this file exists, and what it proves
///
/// It is the **first package adapter** in the compiler, and it is here to close the largest single gap the
/// M0 corpus measured: `Gap` is used **115 times** across the two corpus applications — more than
/// `Container`, more than `SizedBox`, more than any other widget the compiler could not render. It belongs
/// to no framework.
///
/// ADR-18 predicted the shape of this change and staked a claim on it:
///
/// > Adding a package means adding a line in `AdapterRegistry.production()` and a file beside it — and
/// > *nothing else*, anywhere.
///
/// M4-I is the first test of that claim, and it held: this file, one line in the registry, and one JSON
/// catalog. No extractor changed. Nothing in `session/extract/` knows the word `Gap`, which is the whole of
/// ISSUE-16's rule.
///
/// ## What it recognises, and what it deliberately does not
///
/// Only widget-hood and the catalog's facts. `gap` declares no component base, no lifecycle method, no state
/// holder, no store, no navigation vocabulary and no theme — so every one of those answers is the empty one,
/// and they are empty because the package genuinely has nothing to say about them rather than because this
/// adapter has not got round to them.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/element/type.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_context.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_result.dart';
import 'package:bridge_analyzer/src/session/adapters/widget/generated/gap_catalog.dart';

/// Understands the `gap` package's widgets.
final class GapWidgetAdapter implements WidgetAdapter {
  /// Creates the adapter.
  const GapWidgetAdapter();

  @override
  String get name => 'gap';

  /// Higher than Flutter's, so the framework adapter is asked first. A `gap` widget is not a Flutter widget
  /// and the two sets do not overlap, but the ordering is stated rather than left to chance: dispatch order
  /// is `(priority, name)` and a registry whose order could differ between runs is one that could make the
  /// compiler non-deterministic.
  @override
  int get priority => 30;

  @override
  Set<String> get packages => const <String>{GapCatalog.library};

  @override
  Set<String> get symbols => const <String>{'Gap', 'MaxGap', 'SliverGap'};

  @override
  Set<String> get annotations => const <String>{};

  /// A `gap` widget is a Flutter `Widget` — the package extends the framework's own base class — so
  /// recognition is the same resolved-supertype test the Flutter adapter makes, narrowed to this package's
  /// own types. Narrowed, because a `Column` is not this adapter's to claim: the registry chains
  /// `recognise` and the first adapter with an answer wins, so claiming everything would silence Flutter's.
  @override
  WidgetRecognition recognise(AdapterContext context, DartType? type) {
    if (type is! InterfaceType) {
      return WidgetRecognition.none;
    }
    final String? name = type.element.name;
    if (name == null || !GapCatalog.widgets.containsKey(name)) {
      return WidgetRecognition.none;
    }
    // Resolved, not named. A user's own class called `Gap` is not this package's, and claiming it would
    // render somebody's widget as a spacer — the exact defect C1 recorded when 18 widgets were
    // misclassified by name.
    final String library = type.element.library.identifier;
    return library.startsWith(GapCatalog.library)
        ? const WidgetRecognition(isWidget: true)
        : WidgetRecognition.none;
  }

  @override
  bool isSlot(String widget, String parameter) =>
      GapCatalog.widgets[widget]?.slots.contains(parameter) ?? false;

  @override
  String? childrenPropOf(String widget) => GapCatalog.widgets[widget]?.childrenProp;

  @override
  String? positionalPropOf(String widget, String? constructorName, int index) {
    // The whole reason this adapter exists to the extractor: `Gap(16)`'s one argument is positional, so
    // before this it reached UIR as `_positional0` — present, correctly typed, and uninterpretable, which is
    // the defect ADR-0023 names.
    final List<String>? names = GapCatalog.widgets[widget]?.positionalProps[constructorName ?? ''];
    if (names == null || index >= names.length) {
      return null;
    }
    return names[index];
  }

  @override
  (String builderProp, String? valueProp)? rebuildBuilderOf(String widget) => null;

  @override
  (String builderProp, String countProp)? lazyBuilderOf(String widget, String? constructorName) => null;

  @override
  List<String>? constValueFieldsOf(String typeName) => null;

  @override
  Map<String, String> get lifecycleMethods => const <String, String>{};

  @override
  bool isStateHolder(DartType? type) => false;

  @override
  bool isStoreBase(DartType? type) => false;

  @override
  bool isFrameworkLibrary(String library) => library.startsWith(GapCatalog.library);

  @override
  String? widgetOfState(DartType? type) => null;

  @override
  Map<String, Object?> semanticsOf(String widget, Map<String, Object?> constantArguments) =>
      const <String, Object?>{};

  @override
  FunctionExpression? unwrapStateBatch(MethodInvocation node) => null;

  /// `gap` has no notifier of its own; nothing in it announces a change.
  @override
  bool isChangeNotification(MethodInvocation node) => false;

  /// `gap` declares no stateful pair, so it has no props getter.
  @override
  bool isComponentPropsGetter(Expression node) => false;
}
