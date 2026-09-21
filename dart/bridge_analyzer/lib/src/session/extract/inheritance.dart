// Which project classes another class inherits from — the fact a per-file extraction cannot see (M12, ADR-0059).
//
// A class with only record-like constructors is extracted *structurally* (ADR-0036) and emitted as a plain record. A class that
// extends or mixes in another must inherit its members, so the class it inherits from has to be emitted as a real class too — and
// whether `Base` is inherited from is written in `Talker`'s file, not `Base`'s. This is computed once over every unit before any
// is extracted.

import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/element/element.dart';
import 'package:bridge_analyzer/src/session/analysis_session.dart';

/// The key a class is known by across files: its declaring library and its name.
String classKey(Element element) => '${element.library?.identifier}#${element.name}';

/// The classes and mixins some class in [resolved] extends or applies with `with`.
Set<String> inheritedClasses(Iterable<ResolvedUnit> resolved) {
  final Set<String> keys = <String>{};
  void note(NamedType? type) {
    final Element? element = type?.element;
    if (element is ClassElement || element is MixinElement) {
      keys.add(classKey(element!));
    }
  }

  for (final ResolvedUnit resolvedUnit in resolved) {
    for (final CompilationUnitMember member in resolvedUnit.result.unit.declarations) {
      switch (member) {
        case ClassDeclaration():
          note(member.extendsClause?.superclass);
          member.withClause?.mixinTypes.forEach(note);
        case MixinDeclaration():
          member.onClause?.superclassConstraints.forEach(note);
        default:
      }
    }
  }
  return keys;
}
