/// The Flutter framework.
///
/// Layer: `session` (adapters).
///
/// **Recognition only.** This adapter says *what a thing is* — a widget, a text widget, a component
/// base, a lifecycle method, a store. It says nothing about what the compiler should *do* about that.
/// No transformation, no rewriting, no mapping to a target: those are N-pass and generator concerns,
/// and an adapter that reached into them would be a place a target's assumptions could leak into the
/// target-neutral IR (ADR-2).
///
/// Everything here was, until M1-T9, a `const Set<String>` sitting in the middle of an extractor. That
/// was the defect ISSUE-16 named: an extractor with a `flutter` branch in it grows a `go_router` branch,
/// then a `bloc` branch, until nobody can say what the compiler believes. The knowledge has not changed;
/// it has moved to the one place it is allowed to live.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/constant/value.dart';
import 'package:analyzer/dart/element/type.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_context.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_result.dart';
import 'package:bridge_analyzer/src/session/adapters/widget/generated/material_catalog.dart';

/// Understands Flutter's widget model and its theme.
final class FlutterWidgetAdapter implements WidgetAdapter, ThemeAdapter {
  /// Creates the adapter.
  const FlutterWidgetAdapter();

  @override
  String get name => 'flutter';

  @override
  int get priority => 20;

  @override
  Set<String> get packages => const <String>{'package:flutter/'};

  @override
  Set<String> get symbols => const <String>{'Widget', 'StatelessWidget', 'StatefulWidget', 'State'};

  @override
  Set<String> get annotations => const <String>{};

  static const String _package = MaterialCatalog.library;

  @override
  Map<String, String> get lifecycleMethods => MaterialCatalog.lifecycle;

  @override
  WidgetRecognition recognise(AdapterContext context, DartType? type) {
    if (!AdapterContext.isA(type, 'Widget', package: _package)) {
      return WidgetRecognition.none;
    }

    // The name of the type *itself*, not of a supertype: `Text` is a text widget; a user's
    // `HeadlineText extends StatelessWidget` is not, whatever it is called.
    final String? name = type is InterfaceType ? type.element.name : null;
    final WidgetRole? role = name == null ? null : MaterialCatalog.widgets[name]?.role;

    return WidgetRecognition(
      isWidget: true,
      isTextWidget: role == WidgetRole.text,
      isAsyncWidget: role == WidgetRole.async,
      isComponentBase: _extendsAny(type, MaterialCatalog.componentBases),
      isStateBase: _extendsAny(type, <String>{MaterialCatalog.stateBase}),
    );
  }

  @override
  bool isSlot(String widget, String parameter) =>
      // Per widget, not a flat set. `body` is a slot on a `Scaffold`; on some other widget it is a
      // parameter that happens to share the name, and treating it as a slot there was a coarse guess
      // the old hand-written catalog made because it did not know which widget it was looking at.
      MaterialCatalog.widgets[widget]?.slots.contains(parameter) ?? false;

  @override
  String? childrenPropOf(String widget) => MaterialCatalog.widgets[widget]?.childrenProp;

  @override
  bool isStateHolder(DartType? type) => _isOrExtendsAny(type, MaterialCatalog.stateHolders);

  @override
  bool isStoreBase(DartType? type) => _extendsAny(type, MaterialCatalog.storeBases);

  @override
  bool isFrameworkLibrary(String library) =>
      library.startsWith(_package) || library.startsWith('dart:');

  @override
  String? widgetOfState(DartType? type) {
    if (type is! InterfaceType) {
      return null;
    }
    for (final InterfaceType supertype in type.allSupertypes) {
      if (supertype.element.name == 'State' && supertype.typeArguments.length == 1) {
        return supertype.typeArguments.single.element?.name;
      }
    }
    return null;
  }

  @override
  Map<String, Object?> semanticsOf(String widget, Map<String, Object?> constantArguments) {
    final Map<String, Object?> info = <String, Object?>{};
    final Map<String, Object> declared =
        MaterialCatalog.semanticsWidgets[widget] ?? const <String, Object>{};

    // A widget that is *always* excluded, whatever its arguments — `ExcludeSemantics`.
    if (declared['alwaysExcluded'] == true) {
      info['excluded'] = true;
    }

    for (final MapEntry<String, Object?> argument in constantArguments.entries) {
      // A label prop that any widget may carry — `semanticLabel`.
      if (MaterialCatalog.semanticLabelProps.contains(argument.key) && argument.value is String) {
        info['label'] = argument.value;
        continue;
      }

      // A field this *particular* widget declares: `Semantics(label:)` means the label, while
      // `Text(label:)` — were there such a thing — would not.
      for (final MapEntry<String, Object> field in declared.entries) {
        if (field.value == argument.key) {
          final Object? value = argument.value;
          if ((field.key == 'excluded' && value is bool) || value is String) {
            info[field.key] = value;
          }
        }
      }
    }

    return info;
  }

  @override
  FunctionExpression? unwrapStateBatch(MethodInvocation node) {
    if (!MaterialCatalog.stateBatchCalls.contains(node.methodName.name)) {
      return null;
    }

    // Resolved, not named. A user's own `setState` on their own class is not Flutter's, and unwrapping
    // it would delete a call the program actually makes.
    final String? library = node.methodName.element?.library?.identifier;
    if (library == null || !library.startsWith(_package)) {
      return null;
    }

    // `setState(() { … })` — exactly one positional argument, and it is a closure. Anything else is a
    // shape we do not recognise, and we do not guess at it.
    final List<Argument> arguments = node.argumentList.arguments;
    if (arguments.length != 1) {
      return null;
    }
    final Argument argument = arguments.single;
    return argument is FunctionExpression ? argument : null;
  }

  // ── theme ─────────────────────────────────────────────────────────────────────────────────────

  @override
  bool claimsTheme(AdapterContext context, InstanceCreationExpression node) {
    final String type = node.constructorName.type.name.lexeme;
    return MaterialCatalog.themeTypes.contains(type) &&
        AdapterContext.isA(node.staticType, type, package: _package);
  }

  @override
  List<TokenDeclaration> tokensOf(AdapterContext context, InstanceCreationExpression node) {
    final String type = node.constructorName.type.name.lexeme;
    final String? constructor = node.constructorName.name?.name;
    final bool dark = _isDark(node);

    // `ColorScheme.fromSeed(seedColor: …)` — ONE token. N10 derives the other 45 roles from it, using
    // Material Color Utilities. Deriving them here would invent colours the user never wrote.
    if (type == 'ColorScheme' && constructor == MaterialCatalog.seedConstructor) {
      final Expression? seed = _argument(node, MaterialCatalog.seedProp);
      final int? colour = seed == null ? null : _colourOf(seed);
      return colour == null
          ? const <TokenDeclaration>[]
          : <TokenDeclaration>[
              TokenDeclaration(
                group: 'color',
                name: 'seed',
                value: _hex(colour),
                at: seed!,
                isDark: dark,
              ),
            ];
    }

    final List<TokenDeclaration> tokens = <TokenDeclaration>[];
    for (final Argument argument in node.argumentList.arguments) {
      if (argument is! NamedArgument) {
        continue;
      }
      final String name = argument.name.lexeme;
      if (type == 'ColorScheme' && MaterialCatalog.nonRoleProps.contains(name)) {
        continue;
      }
      final int? colour = _colourOf(argument.argumentExpression);
      if (colour == null) {
        continue;
      }
      tokens.add(
        TokenDeclaration(
          group: 'color',
          name: name,
          value: _hex(colour),
          at: argument,
          isDark: dark,
          // On a `ColorScheme`, the argument name *is* the Material role. That is not inference — it
          // is the constructor's own parameter list.
          role: type == 'ColorScheme' ? name : null,
        ),
      );
    }
    return tokens;
  }

  /// Whether a theme is the dark one.
  ///
  /// Read from `brightness:` — the theme's own, or the **enclosing theme's**. A `ColorScheme` nested
  /// inside `ThemeData(brightness: Brightness.dark, colorScheme: ColorScheme(...))` does not restate the
  /// brightness, and it does not have to: it inherits it. Reading only the node's own `brightness:`
  /// makes every dark colour scheme look light, and its roles then overwrite the light ones under the
  /// same token name — silently, and with the wrong colours.
  ///
  /// Walked up the AST rather than remembered in a field: an adapter with state is an adapter whose
  /// answer depends on what it was asked before (ADR-15).
  static bool _isDark(InstanceCreationExpression node) {
    for (AstNode? current = node; current != null; current = current.parent) {
      if (current is! InstanceCreationExpression) {
        continue;
      }
      final Expression? brightness = _argument(current, MaterialCatalog.brightnessProp);
      if (brightness != null) {
        return brightness.toSource().endsWith('dark');
      }
    }
    return false;
  }

  static Expression? _argument(InstanceCreationExpression node, String name) {
    for (final Argument argument in node.argumentList.arguments) {
      if (argument is NamedArgument && argument.name.lexeme == name) {
        return argument.argumentExpression;
      }
    }
    return null;
  }

  /// The colour [node] evaluates to, or `null` if it is not a compile-time colour.
  ///
  /// Uses the analyzer's own constant evaluator, so `Colors.blue`, `Color(0xFF2196F3)` and a `const`
  /// three files away all work — and a *runtime* colour yields nothing rather than a guess. A runtime
  /// colour is not a design token; it is a value, and it stays in the widget tree where it was written.
  static int? _colourOf(Expression node) {
    final DartObject? value = node.computeConstantValue()?.value;
    if (value == null || value.type?.element?.name != 'Color') {
      return null;
    }

    // Flutter stored a packed `value` int historically, and since 3.27 stores `a`/`r`/`g`/`b` as
    // doubles — `value` became a computed getter, which a constant evaluator cannot see. A reader that
    // knows only `value` finds zero colours on any current Flutter.
    final int? packed = value.getField('value')?.toIntValue();
    if (packed != null) {
      return packed;
    }

    final double? a = value.getField('a')?.toDoubleValue();
    final double? r = value.getField('r')?.toDoubleValue();
    final double? g = value.getField('g')?.toDoubleValue();
    final double? b = value.getField('b')?.toDoubleValue();
    if (a == null || r == null || g == null || b == null) {
      return null;
    }
    return (_channel(a) << 24) | (_channel(r) << 16) | (_channel(g) << 8) | _channel(b);
  }

  static int _channel(double value) => (value * 255).round().clamp(0, 255);

  static String _hex(int colour) =>
      '#${(colour & 0xFFFFFFFF).toRadixString(16).padLeft(8, '0').toUpperCase()}';

  /// Whether [type] has any of [names] among its **supertypes** — i.e. a class of this type is one of
  /// those things, rather than being one of those things itself.
  static bool _extendsAny(DartType? type, Set<String> names) {
    if (type is! InterfaceType) {
      return false;
    }
    return type.allSupertypes.any(
      (InterfaceType supertype) => names.contains(supertype.element.name),
    );
  }

  static bool _isOrExtendsAny(DartType? type, Set<String> names) {
    if (type is! InterfaceType) {
      return false;
    }
    return names.contains(type.element.name) || _extendsAny(type, names);
  }
}
