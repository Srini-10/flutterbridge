/// Design tokens.
///
/// Layer: `session` (extraction).
///
/// **This file contains no package knowledge.** It does not know what a `ThemeData` is; it asks the
/// registry, and turns the answer into records (ISSUE-16).
///
/// What it *does* own is the one thing an adapter must not: **a token is one node with two values.** A
/// Flutter app states the same token twice — in `theme:` and in `darkTheme:` — and emitting on sight
/// would declare `color.primary` twice with different content, which is a duplicate symbol (BRG1202)
/// and rightly fatal. So tokens are accumulated across the file and merged before anything is emitted.
library;

import 'package:analyzer/dart/ast/ast.dart';
import 'package:bridge_analyzer/src/diagnostics/codes.dart';
import 'package:bridge_analyzer/src/model/raw_node.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_context.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_registry.dart';
import 'package:bridge_analyzer/src/session/adapters/adapter_result.dart';
import 'package:bridge_analyzer/src/session/extract/raw_node_emitter.dart';
import 'package:bridge_analyzer/src/session/extract/symbol_table.dart';

/// One token, accumulated across the light and the dark theme.
final class _Token {
  _Token(this.declaration);
  final TokenDeclaration declaration;
  Object? light;
  Object? dark;
}

/// Turns the tokens adapters find into records.
final class TokenExtractor {
  /// Creates an extractor.
  TokenExtractor(this.out, this.registry, this.context);

  /// The record factory.
  final RawNodeEmitter out;

  /// The compiler's package knowledge.
  final AdapterRegistry registry;

  /// What the adapters run in.
  final AdapterContext context;

  final Map<String, _Token> _tokens = <String, _Token>{};

  /// Collects the tokens the construction [node] declares.
  void extract(InstanceCreationExpression node) {
    for (final TokenDeclaration token in registry.tokensOf(context, node)) {
      final _Token merged = _tokens.putIfAbsent(
        '${token.group}.${token.name}',
        () => _Token(token),
      );
      if (token.isDark) {
        merged.dark = token.value;
      } else {
        merged.light = token.value;
      }
    }
  }

  /// Emits the tokens collected, merged. Called once, after the file has been walked.
  void flush() {
    // Sorted: two runs that discovered the tokens in different orders must emit the same bytes (D2).
    final List<String> keys = _tokens.keys.toList()..sort();

    for (final String key in keys) {
      final _Token token = _tokens[key]!;
      final TokenDeclaration declaration = token.declaration;

      if (token.light == null) {
        // `app.Token.light` is required, so a token stated only in the dark theme has no home. Using
        // the dark value as the light one would invent a colour the user never wrote (INV-4).
        out.report(
          Codes.unsupportedSyntax,
          'Design token `${declaration.name}` is declared only in the dark theme. app.Token requires '
          'a light value, so it cannot be represented.',
          declaration.at,
        );
        continue;
      }

      out.emit(
        RawNode(
          kind: 'app.Token',
          span: out.span(declaration.at),
          // Not file-scoped. A token is a property of the application, and the same token declared in
          // two files is one token.
          symbol: Symbols.token(declaration.group, declaration.name),
          fields: <String, RawValue>{
            'group': RawLiteral(declaration.group),
            'name': RawLiteral(declaration.name),
            if (declaration.role case final String role) 'role': RawLiteral(role),
            'light': RawLiteral(token.light),
            if (token.dark != null) 'dark': RawLiteral(token.dark),
          },
        ),
      );
    }
  }
}
