/// File digests.
///
/// Layer: `session` — the analyzer quarantine (ADR-14). This is the only module that reads Dart
/// syntax for the cache, and it produces plain data.
///
/// A digest answers *what does this file export, what does it hide, and what does it import* — the
/// three facts an incremental build needs before it can decide whether to do any work at all.
///
/// It is computed from the **parsed** unit, not the resolved one. Parsing is an order of magnitude
/// cheaper than resolution, and the digest of an unchanged file is served from the cache anyway, so
/// the common case never parses either.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:bridge_analyzer/src/cache/content_hash.dart';
import 'package:bridge_analyzer/src/cache/module_artifact.dart';
import 'package:path/path.dart' as p;

/// Computes [FileDigest]s.
final class DigestComputer {
  /// Creates a computer for the package named [packageName].
  const DigestComputer({required this.packageName});

  /// The analyzed package's name, so that `package:<self>/…` imports are recognised as internal.
  final String packageName;

  /// Computes the digest of [path] (project-relative) from its [unit] and its [source].
  FileDigest compute({
    required String path,
    required CompilationUnit unit,
    required String source,
  }) {
    final List<String> api = <String>[];
    final List<String> impl = <String>[];

    for (final CompilationUnitMember member in unit.declarations) {
      _describe(member, api, impl);
    }

    // Signatures are sorted: the *set* of things a file exports is what dependents care about, not
    // the order they happen to be declared in. Moving a method must not rebuild the world.
    api.sort();

    return FileDigest(
      path: path,
      contentHash: hashString(source),
      apiFingerprint: hashParts(api),
      // Bodies keep their declaration order: unlike a signature set, an implementation is a sequence.
      implFingerprint: hashParts(impl),
      imports: _imports(unit, path),
    );
  }

  /// Splits [member] into what it *exports* (api) and what it *does* (impl).
  ///
  /// The line between them is the line the whole API/impl split is built on: a signature is anything
  /// another file could possibly observe; a body is anything it could not.
  void _describe(CompilationUnitMember member, List<String> api, List<String> impl) {
    switch (member) {
      case ClassDeclaration():
        final String name = member.namePart.typeName.lexeme;
        final String header =
            'class $name'
            '${member.extendsClause?.toSource() ?? ''}'
            '${member.withClause?.toSource() ?? ''}'
            '${member.implementsClause?.toSource() ?? ''}';
        api.add(header);

        for (final ClassMember classMember in member.body.members) {
          switch (classMember) {
            case MethodDeclaration():
              api.add(
                '$name.${classMember.name.lexeme}'
                '${classMember.parameters?.toSource() ?? ''}'
                ':${classMember.returnType?.toSource() ?? ''}',
              );
              impl.add(classMember.body.toSource());
            case FieldDeclaration():
              for (final VariableDeclaration variable in classMember.fields.variables) {
                api.add(
                  '$name.${variable.name.lexeme}:'
                  '${classMember.fields.type?.toSource() ?? ''}',
                );
                // A field's initializer is an implementation detail — unless it is `const`, in which
                // case its *value* is part of the surface, because another file can inline it.
                final String? initializer = variable.initializer?.toSource();
                if (initializer != null) {
                  if (classMember.fields.isConst) {
                    api.add('$name.${variable.name.lexeme}=$initializer');
                  } else {
                    impl.add(initializer);
                  }
                }
              }
            case ConstructorDeclaration():
              api.add(
                '$name.new${classMember.name?.lexeme ?? ''}'
                '${classMember.parameters.toSource()}',
              );
              impl.add(classMember.body.toSource());
            case ClassMember():
              impl.add(classMember.toSource());
          }
        }

      case FunctionDeclaration():
        api.add(
          'fn ${member.name.lexeme}'
          '${member.functionExpression.parameters?.toSource() ?? ''}'
          ':${member.returnType?.toSource() ?? ''}',
        );
        impl.add(member.functionExpression.body.toSource());

      case EnumDeclaration():
        api.add('enum ${member.namePart.typeName.lexeme}');
        for (final EnumConstantDeclaration constant in member.body.constants) {
          api.add('enumval ${constant.name.lexeme}');
        }

      case TopLevelVariableDeclaration():
        for (final VariableDeclaration variable in member.variables.variables) {
          api.add('var ${variable.name.lexeme}:${member.variables.type?.toSource() ?? ''}');
          final String? initializer = variable.initializer?.toSource();
          if (initializer != null) {
            // A top-level `const` is part of the surface for the same reason a `const` field is.
            if (member.variables.isConst) {
              api.add('var ${variable.name.lexeme}=$initializer');
            } else {
              impl.add(initializer);
            }
          }
        }

      case CompilationUnitMember():
        // Typedefs, extensions, mixins: their whole declaration is surface.
        api.add(member.toSource());
    }
  }

  /// The project files [unit] imports, project-relative and sorted.
  ///
  /// SDK and third-party imports are excluded: they cannot change during a build, and what pins them
  /// is the version context, not the dependency graph.
  List<String> _imports(CompilationUnit unit, String path) {
    final Set<String> imports = <String>{};
    final String directory = p.dirname(path);

    for (final Directive directive in unit.directives) {
      final String? uri = switch (directive) {
        ImportDirective() => directive.uri.stringValue,
        ExportDirective() => directive.uri.stringValue,
        PartDirective() => directive.uri.stringValue,
        Directive() => null,
      };
      if (uri == null || uri.startsWith('dart:')) {
        continue;
      }

      if (uri.startsWith('package:$packageName/')) {
        imports.add(p.normalize(p.join('lib', uri.substring('package:$packageName/'.length))));
      } else if (!uri.startsWith('package:')) {
        imports.add(p.normalize(p.join(directory, uri)));
      }
    }

    return imports.toList()..sort();
  }
}
