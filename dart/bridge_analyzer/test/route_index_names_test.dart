import 'package:bridge_analyzer/src/builder/route_index.dart';
import 'package:test/test.dart';

void main() {
  group('RouteIndex.resolveName (ADR-0072)', () {
    final RouteIndex index = RouteIndex(
      <({String path, String id})>[(path: '/a', id: 'a'), (path: '/b', id: 'b'), (path: '/c', id: 'c')],
      names: <({String name, String id})>[(name: 'home', id: 'a'), (name: 'twin', id: 'b'), (name: 'twin', id: 'c')],
    );

    test('a name resolves to the one route that carries it', () {
      expect(index.resolveName('home'), 'a');
    });

    test('a name no route carries resolves to nothing', () {
      expect(index.resolveName('nowhere'), isNull);
    });

    test('a name two routes carry resolves to nothing — the compiler will not pick one', () {
      expect(index.resolveName('twin'), isNull);
    });

    test('a name is not a path: paths and names are separate tables', () {
      expect(index.resolveName('/a'), isNull);
      expect(index.resolve('/a'), 'a');
    });
  });
}
