/// Resolving a wrapper class back to the API it wraps.
///
/// Layer: `session` (adapters).
///
/// ## The problem
///
/// Applications wrap routing APIs. wonderous writes `AppRoute(ScreenPaths.home, (_) => HomeScreen())`
/// where `AppRoute extends GoRoute` — **positional** arguments, and a page produced inside a closure.
/// An adapter that knows only `GoRoute(path:, builder:)` finds zero routes in a dozen.
///
/// ## The wrong fix, and the right one
///
/// The tempting fix is a rule: *"the first positional argument is the path."* It is a heuristic, it is
/// wrong for the next application, and it is precisely what ISSUE-16 forbids.
///
/// The right fix is to **read the wrapper's constructor**, because every fact needed is written down in
/// the user's own code:
///
/// ```dart
/// AppRoute(String path, Widget Function(GoRouterState) builder, {List<GoRoute> routes = const []})
///   : super(
///       path: path,                                        // (1)
///       routes: routes,                                    // (2)
///       pageBuilder: (context, state) {
///         ... Scaffold(body: builder(state)) ...           // (3)
///       },
///     );
/// ```
///
/// 1. The super argument `path` **is** the wrapper's first positional parameter. So argument 0 at a
///    call site is the route's path. Not a guess — the constructor says so.
/// 2. Same for `routes`, a named parameter.
/// 3. The super argument `pageBuilder` is a closure that **invokes** the wrapper's `builder` parameter.
///    So `builder` is what produces the page. The data flow is right there; we follow it.
///
/// Anything a wrapper does not forward in one of those two ways is genuinely unknowable from the call
/// site, and it becomes a diagnostic rather than an invention.
///
/// ## Limit
///
/// The wrapper must be declared in the **same file** as its use. Reaching a class in another file means
/// resolving that library, which is asynchronous, and an adapter runs inside a synchronous walk. A
/// wrapper declared elsewhere is reported, never guessed at. wonderous declares `AppRoute` in the file
/// that uses it, which is the common shape.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:meta/meta.dart';

/// Where a wrapped API's argument comes from, at the wrapper's call site.
@immutable
sealed class ArgumentSelector {
  const ArgumentSelector();
}

/// The nth positional argument.
@immutable
final class PositionalArgument extends ArgumentSelector {
  /// Creates a selector.
  const PositionalArgument(this.index);

  /// The index among positional arguments.
  final int index;
}

/// The named argument called [name].
@immutable
final class NamedArgumentRef extends ArgumentSelector {
  /// Creates a selector.
  const NamedArgumentRef(this.name);

  /// The argument's name.
  final String name;
}

/// How a call site's arguments map onto the wrapped API's parameters.
@immutable
final class ArgumentMapping {
  const ArgumentMapping._(this._selectors, {required this.isWrapper, this.wrapperName});

  /// A mapping through the wrapper [name].
  const ArgumentMapping.wrapper(String name, Map<String, ArgumentSelector> selectors)
    : this._(selectors, isWrapper: true, wrapperName: name);

  /// The identity mapping: the API is constructed directly, so a named argument means itself.
  static const ArgumentMapping identity = ArgumentMapping._(
    <String, ArgumentSelector>{},
    isWrapper: false,
  );

  final Map<String, ArgumentSelector> _selectors;

  /// Whether the construction went through a wrapper class.
  final bool isWrapper;

  /// The wrapper's name, for diagnostics.
  final String? wrapperName;

  /// The argument at a call site that fills the wrapped API's [parameter], or `null` if nothing does.
  Expression? argumentFor(String parameter, ArgumentList arguments) {
    if (!isWrapper) {
      return _named(arguments, parameter);
    }
    return switch (_selectors[parameter]) {
      NamedArgumentRef(:final String name) => _named(arguments, name),
      PositionalArgument(:final int index) => _positional(arguments, index),
      null => null,
    };
  }

  static Expression? _named(ArgumentList arguments, String name) {
    for (final Argument argument in arguments.arguments) {
      if (argument is NamedArgument && argument.name.lexeme == name) {
        return argument.argumentExpression;
      }
    }
    return null;
  }

  static Expression? _positional(ArgumentList arguments, int index) {
    int seen = 0;
    for (final Argument argument in arguments.arguments) {
      if (argument is NamedArgument) {
        continue;
      }
      if (argument is Expression) {
        if (seen == index) {
          return argument;
        }
        seen++;
      }
    }
    return null;
  }
}

/// Reads a wrapper's constructor to find out how its arguments reach the API it wraps.
///
/// Pure. No state, module-scope or otherwise (ADR-15): the unit is handed in, because the only thing
/// that could tempt this into holding one is convenience, and convenience is how a compiler acquires
/// state that differs between two runs.
abstract final class WrapperResolver {
  /// The mapping for the construction [node], whose enclosing file is [unit].
  ///
  /// The identity mapping when the API is constructed directly — which is the common case, and the one
  /// where a named argument simply means itself.
  static ArgumentMapping mappingFor(InstanceCreationExpression node, CompilationUnit unit) {
    final ConstructorDeclaration? constructor = _constructorIn(unit, node);
    if (constructor == null) {
      return ArgumentMapping.identity;
    }

    final SuperConstructorInvocation? superCall = constructor.initializers
        .whereType<SuperConstructorInvocation>()
        .firstOrNull;
    if (superCall == null) {
      return ArgumentMapping.identity;
    }

    // How a call site reaches each of the wrapper's own parameters.
    final Map<String, ArgumentSelector> parameters = <String, ArgumentSelector>{};
    int positional = 0;
    for (final FormalParameter parameter in constructor.parameters.parameters) {
      final String? name = parameter.name?.lexeme;
      if (name == null) {
        continue;
      }
      parameters[name] = parameter.isNamed
          ? NamedArgumentRef(name)
          : PositionalArgument(positional++);
    }

    // Which of the wrapper's parameters fills each parameter of the API it wraps.
    final Map<String, ArgumentSelector> selectors = <String, ArgumentSelector>{};
    for (final Argument argument in superCall.argumentList.arguments) {
      if (argument is! NamedArgument) {
        continue;
      }
      final String? forwarded = _forwardedParameter(
        argument.argumentExpression,
        parameters.keys.toSet(),
      );
      final ArgumentSelector? selector = forwarded == null ? null : parameters[forwarded];
      if (selector != null) {
        selectors[argument.name.lexeme] = selector;
      }
    }

    return ArgumentMapping.wrapper(_nameOf(node), selectors);
  }

  /// The wrapper parameter that [expression] carries into the wrapped constructor.
  ///
  /// Two shapes, and both are the *code* saying so rather than us assuming it:
  ///
  /// * `path: path` — a bare reference. The parameter **is** the argument.
  /// * `pageBuilder: (c, s) { … builder(state) … }` — a closure that **invokes** the parameter. The
  ///   parameter is what produces the value; the closure is packaging around it.
  ///
  /// Restricted to [parameters]: a closure calling `Scaffold(...)` invokes something, but not a
  /// parameter, and matching it would be exactly the kind of guess this file exists to avoid.
  static String? _forwardedParameter(Expression expression, Set<String> parameters) {
    if (expression is SimpleIdentifier) {
      return parameters.contains(expression.name) ? expression.name : null;
    }
    if (expression is FunctionExpression) {
      final _InvokedParameter finder = _InvokedParameter(parameters);
      expression.body.accept(finder);
      return finder.name;
    }
    return null;
  }

  /// The constructor of [node]'s type, if that type is declared in [unit].
  ///
  /// Matched on the resolved element, never on the name — two classes may share a name across files,
  /// and picking the wrong one would map arguments to the wrong parameters.
  static ConstructorDeclaration? _constructorIn(
    CompilationUnit unit,
    InstanceCreationExpression node,
  ) {
    final Object? target = node.constructorName.element?.firstFragment;
    if (target == null) {
      return null;
    }

    for (final CompilationUnitMember member in unit.declarations) {
      if (member is! ClassDeclaration) {
        continue;
      }
      for (final ClassMember classMember in member.body.members) {
        if (classMember is ConstructorDeclaration &&
            identical(classMember.declaredFragment, target)) {
          return classMember;
        }
      }
    }
    return null;
  }

  static String _nameOf(InstanceCreationExpression node) =>
      node.constructorName.type.name.lexeme;
}

/// Finds which of a known set of parameters a closure invokes.
final class _InvokedParameter extends RecursiveAstVisitor<void> {
  _InvokedParameter(this._parameters);

  final Set<String> _parameters;

  /// The parameter invoked, if one was.
  String? name;

  void _record(String candidate) {
    if (name == null && _parameters.contains(candidate)) {
      name = candidate;
    }
  }

  @override
  void visitFunctionExpressionInvocation(FunctionExpressionInvocation node) {
    final Expression function = node.function;
    if (function is SimpleIdentifier) {
      _record(function.name);
    }
    super.visitFunctionExpressionInvocation(node);
  }

  @override
  void visitMethodInvocation(MethodInvocation node) {
    if (node.realTarget == null) {
      _record(node.methodName.name);
    }
    super.visitMethodInvocation(node);
  }
}
