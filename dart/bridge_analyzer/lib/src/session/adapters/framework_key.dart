/// Whether a named constructor argument is Flutter's `Key`.
///
/// Layer: `session` (adapters).
///
/// A `key:` is an **identity hint to the framework** — "if this changes, discard the State beneath" — not data the
/// destination receives. It is not one of the component's own parameters (a component's `key` is never recorded as
/// one), so an argument recorded for it names nothing on the destination: it was read as a *live object* (BRG2301)
/// and refused, for a value that was never going to reach the screen. Decided by the **resolved parameter type**, not
/// by the spelling `key`: a project widget's own `Key`-typed data parameter under another name is the same thing, and a
/// non-`Key` parameter that happens to be called `key` is data and is kept.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/element/element.dart';
import 'package:analyzer/dart/element/type.dart';

/// Whether [name], passed to [construction], is the framework's `Key` parameter.
bool isFrameworkKeyArgument(InstanceCreationExpression construction, String name) {
  for (final FormalParameterElement parameter
      in construction.constructorName.element?.formalParameters ?? const <FormalParameterElement>[]) {
    if (!parameter.isNamed || parameter.name != name) {
      continue;
    }
    final DartType type = parameter.type;
    if (type is! InterfaceType) {
      return false;
    }
    // `Key` itself, or a subtype the caller passes (`ValueKey`, `GlobalKey`) declared as the parameter's type.
    for (final InterfaceType candidate in <InterfaceType>[type, ...type.allSupertypes]) {
      if (candidate.element.name == 'Key' && candidate.element.library.uri.toString().startsWith('package:flutter/')) {
        return true;
      }
    }
    return false;
  }
  return false;
}
