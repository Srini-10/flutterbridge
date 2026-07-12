/// Tests for the generated Dart models.
///
/// These are hand-written on purpose: they are the independent check that the *generator* is right.
/// A generator that also generated its own tests would only prove it is self-consistent.
@TestOn('vm')
library;

import 'dart:convert';
import 'dart:io';

import 'package:bridge_uir/bridge_uir.dart';
import 'package:test/test.dart';

/// A span, reused by every fixture below.
const SourceSpan span = SourceSpan(file: 'lib/main.dart', line: 10, column: 3);

UiText text(String id, String value) => UiText(
  id: id,
  span: span,
  value: ConstBinding(id: '$id-b', span: span, value: value),
);

void main() {
  group('schema version', () {
    test('the library declares the schema version it came from', () {
      // From the schema, never a literal. A pinned literal fails on every amendment, which teaches
      // whoever is holding the amendment to edit the assertion — and an assertion that gets edited
      // whenever it fires is not an assertion. What is worth checking is that the *generated* constant
      // has not drifted from the schema that generated it.
      final Map<String, Object?> shared =
          jsonDecode(File('../../packages/uir/schema/shared.json').readAsStringSync())
              as Map<String, Object?>;

      expect(uirVersion, shared['x-uir-version']);
    });
  });

  group('canonical numbers (Spec v2.3 §A15)', () {
    test('an integral double is written as an integer — no trailing .0', () {
      // Dart writes the double 100.0 as `100.0`; JavaScript writes it as `100`. Two byte-forms of one
      // node means two ids for one node (§A16), and the moment N5 mints a node in TypeScript the two
      // domains would disagree about what it is called.
      expect(canonicalNumber(100.0), '100');
      expect(canonicalNumber(100), '100');
      expect(canonicalNumber(1e20), '100000000000000000000');
    });

    test('zero is unsigned', () {
      expect(canonicalNumber(-0.0), '0');
      expect(canonicalNumber(0.0), '0');
      expect(canonicalNumber(0), '0');
    });

    test('a non-integral double keeps its shortest round-trip form', () {
      expect(canonicalNumber(0.1), '0.1');
      expect(canonicalNumber(3.141592653589793), '3.141592653589793');
      expect(canonicalNumber(-0.5), '-0.5');
    });

    test('exponent form only where the shortest representation needs it', () {
      expect(canonicalNumber(1e21), '1e+21');
      expect(canonicalNumber(1e-7), '1e-7');
      expect(canonicalNumber(0.000001), '0.000001');
      expect(canonicalNumber(5e-324), '5e-324');
    });

    test('NaN and infinities have no canonical form', () {
      expect(() => canonicalNumber(double.nan), throwsArgumentError);
      expect(() => canonicalNumber(double.infinity), throwsArgumentError);
    });

    test('an int beyond 2^53 is refused — it cannot survive a JavaScript reader', () {
      // A double of any magnitude is fine: it is already a double. A 64-bit *int* above 2^53 is not.
      expect(canonicalNumber(maxSafeInteger), '9007199254740991');
      expect(() => canonicalNumber(maxSafeInteger + 1), throwsArgumentError);
      expect(canonicalNumber(1e21), '1e+21');
    });

    test('canonicalEncode writes the whole node, numbers included', () {
      expect(
        canonicalEncode(<String, Object?>{'b': 100.0, 'a': <Object>[1.0, -0.0], 'z': null}),
        '{"a":[1,0],"b":100}',
      );
    });
  });

  group('serialization round-trip', () {
    test('a simple node survives toJson -> fromJson', () {
      final UiText node = text('n1', 'Sign in');
      final UiText back = UiText.fromJson(node.toJson());
      expect(back, node);
    });

    test('a nested tree survives, with child order preserved', () {
      final UiElement node = UiElement(
        id: 'root',
        span: span,
        component: const WidgetRef(name: 'Column'),
        children: <UiNode>[text('a', 'first'), text('b', 'second'), text('c', 'third')],
      );

      final UiElement back = UiElement.fromJson(node.toJson());

      expect(back, node);
      expect(
        back.children!.map((UiNode n) => (n as UiText).id).toList(),
        <String>['a', 'b', 'c'],
        reason: 'children are ordered — the order they appear on screen is semantic (Spec §2.3)',
      );
    });

    test('a union round-trips through its base, dispatching on kind', () {
      final UiNode node = text('n1', 'hello');
      final UiNode back = UiNode.fromJson(node.toJson());
      expect(back, isA<UiText>());
      expect(back, node);
    });

    test('optional fields are omitted from JSON rather than serialized as null', () {
      final Map<String, Object?> json = text('n1', 'x').toJson();
      expect(json.containsKey('anchor'), isFalse);
      expect(json.containsKey('style'), isFalse);
    });

    test('serialization is canonical: keys are sorted, whatever order they were built in', () {
      final Map<String, Object?> json = text('n1', 'x').toJson();
      expect(json.keys.toList(), orderedEquals(List<String>.of(json.keys)..sort()));
    });
  });

  group('deserialization validates', () {
    test('a missing required field is rejected, with a path', () {
      expect(
        () => UiText.fromJson(<String, Object?>{
          'kind': 'ui.Text',
          'id': 'n1',
          'span': span.toJson(),
        }),
        throwsA(
          isA<UirParseError>().having((UirParseError e) => e.path, 'path', contains('value')),
        ),
      );
    });

    test('a wrong kind is rejected', () {
      expect(
        () => UiText.fromJson(const <String, Object?>{'kind': 'ui.Element', 'id': 'n1'}),
        throwsA(isA<UirParseError>()),
      );
    });

    test('an unknown kind on a union is rejected', () {
      expect(
        () => UiNode.fromJson(<String, Object?>{'kind': 'ui.Nonsense', 'id': 'n1'}),
        throwsA(isA<UirParseError>()),
      );
    });

    test('a value outside an enum is rejected', () {
      expect(() => StoreOrigin.fromJson('invented'), throwsA(isA<UirParseError>()));
    });

    test('a wrongly typed field is rejected', () {
      expect(
        () => SourceSpan.fromJson(const <String, Object?>{
          'file': 'a.dart',
          'line': 'ten',
          'column': 1,
        }),
        throwsA(isA<UirParseError>()),
      );
    });
  });

  group('value semantics', () {
    test('equality is structural, not identity', () {
      expect(text('n1', 'x'), equals(text('n1', 'x')));
      expect(text('n1', 'x'), isNot(equals(text('n1', 'y'))));
    });

    test('equal nodes hash equally', () {
      expect(text('n1', 'x').hashCode, text('n1', 'x').hashCode);
    });

    test('list order is part of equality', () {
      UiElement withChildren(List<UiNode> children) => UiElement(
        id: 'r',
        span: span,
        component: const WidgetRef(name: 'Row'),
        children: children,
      );

      expect(
        withChildren(<UiNode>[text('a', '1'), text('b', '2')]),
        isNot(equals(withChildren(<UiNode>[text('b', '2'), text('a', '1')]))),
        reason: 'reordering children changes what is on screen; it must change equality too',
      );
    });

    test('copyWith replaces only the named field, and does not mutate the original', () {
      final UiText original = text('n1', 'before');
      final UiText copy = original.copyWith(id: 'n2');

      expect(copy.id, 'n2');
      expect(copy.value, original.value);
      expect(original.id, 'n1', reason: 'the original is immutable');
    });
  });

  group('the amendments the schema had to carry', () {
    test('a store records whether it was declared or promoted by N11 (ADR-11)', () {
      const Store declared = Store(
        id: 's1',
        span: span,
        name: 'CartStore',
        origin: StoreOrigin.declared,
      );
      const Store promoted = Store(
        id: 's2',
        span: span,
        name: 'ThemeStore',
        origin: StoreOrigin.promoted,
      );

      expect(declared.toJson()['origin'], 'declared');
      expect(promoted.toJson()['origin'], 'promoted');
      expect(Store.fromJson(promoted.toJson()).origin, StoreOrigin.promoted);
    });

    test('a signal is component- or store-scoped, and N11 rewrites the one to the other', () {
      const Signal componentScoped = Signal(
        id: 'sig1',
        span: span,
        type: TypeRef(name: 'bool'),
        scope: SignalScope.component,
      );

      final Signal promoted = componentScoped.copyWith(scope: SignalScope.store, store: 'store1');

      expect(promoted.scope, SignalScope.store);
      expect(promoted.store, 'store1');
    });

    test(
      'a route argument records how it survives the URL boundary, and which diagnostic it raised',
      () {
        const RouteArgument callback = RouteArgument(
          name: 'onToggleTheme',
          transport: RouteArgumentTransport.promotedCallback,
          diagnostic: DiagnosticCode.BRG2302,
        );
        const RouteArgument object = RouteArgument(
          name: 'product',
          transport: RouteArgumentTransport.objectTransport,
          diagnostic: DiagnosticCode.BRG2301,
        );

        expect(callback.toJson()['transport'], 'promotedCallback');
        expect(object.toJson()['diagnostic'], 'BRG2301');
      },
    );

    test('layout intent is carried per element, and is optional (ADR-13 / A3)', () {
      const UiElement plain = UiElement(
        id: 'e1',
        span: span,
        component: WidgetRef(name: 'Text'),
      );
      expect(plain.layout, isNull, reason: 'existing node semantics are unchanged when absent');

      final UiElement withIntent = plain.copyWith(
        layout: const LayoutIntent(
          widthIntent: SizeIntent.fill,
          heightIntent: SizeIntent.shrink,
          tier: LayoutTier.css,
        ),
      );
      expect(UiElement.fromJson(withIntent.toJson()).layout?.widthIntent, SizeIntent.fill);
    });

    test('Material colour roles are an enum, so a token can never carry a guessed colour', () {
      expect(
        MaterialRole.values.map((MaterialRole r) => r.name),
        contains('surfaceContainerHighest'),
      );
      expect(MaterialRole.values.map((MaterialRole r) => r.name), contains('inversePrimary'));
      expect(
        MaterialRole.values.length,
        greaterThanOrEqualTo(40),
        reason: 'the full derived M3 role set, not a hand-picked subset (ADR-13)',
      );
    });
  });

  group('visitors', () {
    test('a visitor dispatches to the right variant', () {
      final String result = UiNode.fromJson(text('n1', 'hi').toJson()).accept(_KindVisitor());
      expect(result, 'ui.Text');
    });
  });
}

/// A visitor that reports which variant it was handed. Implementing it at all proves the interface
/// is exhaustive: adding a UI node to the schema breaks this class at compile time.
final class _KindVisitor implements UiNodeVisitor<String> {
  @override
  String visitUiAsync(UiAsync node) => node.kind;
  @override
  String visitUiCond(UiCond node) => node.kind;
  @override
  String visitUiElement(UiElement node) => node.kind;
  @override
  String visitUiList(UiList node) => node.kind;
  @override
  String visitUiOpaque(UiOpaque node) => node.kind;
  @override
  String visitUiOverrideRef(UiOverrideRef node) => node.kind;
  @override
  String visitUiSlotRef(UiSlotRef node) => node.kind;
  @override
  String visitUiText(UiText node) => node.kind;
}
