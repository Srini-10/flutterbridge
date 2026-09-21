import 'dart:convert';
import 'dart:io';

import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dio_client/client.dart';

// The oracle for the generated React components: each scenario taps buttons that call a repository over Dio; a canned HttpClientAdapter (the
// generated component gets a canned `fetch` built from the same `responses.json`) answers, echoing each request. Records the `Text`s starting with "> ".
// `WRITE_EXPECTED=1 flutter test` rewrites `expected.json`.

/// The canned server both sides use: `test/responses.json` (the generated component's `fetch` reads the same file).
final Map<String, dynamic> responses = jsonDecode(File('test/responses.json').readAsStringSync()) as Map<String, dynamic>;

class CannedAdapter implements HttpClientAdapter {
  @override
  void close({bool force = false}) {}

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    final String key = '${options.method} ${options.path}';
    final Map<String, dynamic>? route = responses[key] as Map<String, dynamic>?;
    if (route == null) throw StateError('no canned response for $key');
    if (route['error'] == 'connection') {
      throw DioException.connectionError(requestOptions: options, reason: 'canned');
    }
    // Requests are echoed, so a wrong URL, query, header or body is visible in the output.
    final Map<String, dynamic> body = <String, dynamic>{
      ...(route['body'] as Map<String, dynamic>),
      'echo': <String, dynamic>{
        'method': options.method,
        'path': options.path,
        'query': options.queryParameters.map((String k, dynamic v) => MapEntry<String, dynamic>(k, '$v')),
        'xApp': options.headers['x-app'],
        'xReason': options.headers['x-reason'],
        'contentType': options.contentType?.split(';').first,
        'body': options.data,
      },
    };
    return ResponseBody.fromString(jsonEncode(body), route['status'] as int, headers: <String, List<String>>{
      Headers.contentTypeHeader: <String>['application/json'],
    });
  }
}

Dio cannedDio() => Dio(BaseOptions(baseUrl: 'http://api.test/v1', headers: <String, dynamic>{'x-app': 'bridge'}))
  ..httpClientAdapter = CannedAdapter();

final Map<String, Widget Function()> widgets = <String, Widget Function()>{
  'Loader': () => Loader(api: Api(dio: cannedDio())),
};

List<String> outputs(WidgetTester tester) => <String>[
      for (final Text t in tester.widgetList<Text>(find.byType(Text)))
        if ((t.data ?? '').startsWith('> ')) t.data!,
    ];

void main() {
  final Map<String, dynamic> scripts = jsonDecode(
    File('test/scenarios.json').readAsStringSync(),
  ) as Map<String, dynamic>;
  final Map<String, List<List<String>>> recorded =
      <String, List<List<String>>>{};

  for (final MapEntry<String, dynamic> entry in scripts.entries) {
    testWidgets('scenario ${entry.key}', (WidgetTester tester) async {
      tester.view.physicalSize = const Size(800, 4000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(child: widgets[entry.key]!()),
          ),
        ),
      );
      final List<List<String>> trace = <List<String>>[outputs(tester)];
      for (final Object? step in entry.value as List<dynamic>) {
        await tester.tap(find.widgetWithText(ElevatedButton, step! as String));
        // The canned adapter answers on the next microtasks; let the futures settle.
        await tester.pump();
        for (int i = 0; i < 5; i++) {
          await tester.pump(const Duration(milliseconds: 20));
        }
        trace.add(outputs(tester));
      }
      recorded[entry.key] = trace;
    });
  }

  tearDownAll(() {
    final String rendered =
        '${const JsonEncoder.withIndent('  ').convert(recorded)}\n';
    final File file = File('test/expected.json');
    if (Platform.environment['WRITE_EXPECTED'] == '1') {
      file.writeAsStringSync(rendered);
    } else if (file.readAsStringSync() != rendered) {
      throw StateError(
        'test/expected.json is stale: rerun with WRITE_EXPECTED=1 and review the diff.',
      );
    }
  });
}
