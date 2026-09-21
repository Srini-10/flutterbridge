import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';

Future<HttpServer> serve() async {
  final server = await HttpServer.bind('127.0.0.1', 0);
  server.listen((HttpRequest req) async {
    final body = await utf8.decoder.bind(req).join();
    void send(int status, Object? data, {String type = 'application/json'}) {
      req.response.statusCode = status;
      req.response.headers.set('content-type', type);
      req.response.write(type == 'application/json' ? jsonEncode(data) : data);
      req.response.close();
    }

    final path = req.uri.path;
    if (path == '/json') return send(200, {'a': 1, 'b': [1, 2], 's': 'x'});
    if (path == '/list') return send(200, [1, 2, 3]);
    if (path == '/text') return send(200, 'hello', type: 'text/plain');
    if (path == '/empty') {
      req.response.statusCode = 204;
      return req.response.close();
    }
    if (path.startsWith('/status/')) return send(int.parse(path.substring(8)), {'error': 'nf'});
    if (path == '/slow') {
      await Future<void>.delayed(const Duration(milliseconds: 400));
      return send(200, {'slow': true});
    }
    if (path == '/echo') {
      return send(200, {
        'method': req.method,
        'query': req.uri.queryParameters,
        'queryAll': req.uri.queryParametersAll,
        'xTest': req.headers.value('x-test'),
        'body': body.isEmpty ? null : jsonDecode(body),
        'contentType': req.headers.contentType?.mimeType,
      });
    }
    send(404, {'error': 'no route'});
  });
  return server;
}

Map<String, Object?> outcome(Response<dynamic>? r) => {'status': r?.statusCode, 'data': r?.data};

Future<Map<String, Object?>> attempt(Future<Response<dynamic>> Function() call) async {
  try {
    return {'ok': true, ...outcome(await call())};
  } on DioException catch (e) {
    return {'ok': false, 'type': e.type.name, 'status': e.response?.statusCode, 'data': e.response?.data};
  }
}

Future<void> main() async {
  final server = await serve();
  final base = 'http://127.0.0.1:${server.port}';
  final dio = Dio(BaseOptions(baseUrl: base, headers: {'x-test': 'base'}));
  final results = <String, Object?>{};
  results['getJson'] = await attempt(() => dio.get<Map<String, dynamic>>('/json'));
  results['getList'] = await attempt(() => dio.get<List<dynamic>>('/list'));
  results['getText'] = await attempt(() => dio.get<String>('/text'));
  results['getEmpty'] = await attempt(() => dio.get<void>('/empty'));
  results['query'] = await attempt(() => dio.get<Map<String, dynamic>>('/echo', queryParameters: {'x': 1, 'y': 'two'}));
  results['listQuery'] = await attempt(() => dio.get<Map<String, dynamic>>('/echo', queryParameters: {'ids': [1, 2], 'n': null}));
  results['headersBase'] = await attempt(() => dio.get<Map<String, dynamic>>('/echo'));
  results['headersOverride'] = await attempt(() => dio.get<Map<String, dynamic>>('/echo', options: Options(headers: {'x-test': 'call'})));
  results['post'] = await attempt(() => dio.post<Map<String, dynamic>>('/echo', data: {'k': [1, 2], 'n': null}));
  results['put'] = await attempt(() => dio.put<Map<String, dynamic>>('/echo', data: {'v': 1}));
  results['patch'] = await attempt(() => dio.patch<Map<String, dynamic>>('/echo', data: {'v': 2}));
  results['delete'] = await attempt(() => dio.delete<Map<String, dynamic>>('/echo'));
  results['notFound'] = await attempt(() => dio.get<dynamic>('/status/404'));
  results['serverError'] = await attempt(() => dio.get<dynamic>('/status/500'));
  results['receiveTimeout'] = await attempt(() => dio.get<dynamic>('/slow', options: Options(receiveTimeout: const Duration(milliseconds: 100))));
  results['absoluteUrl'] = await attempt(() => Dio().get<Map<String, dynamic>>('$base/json'));
  final refused = Dio(BaseOptions(baseUrl: 'http://127.0.0.1:1'));
  results['refused'] = await attempt(() => refused.get<dynamic>('/x'));
  await server.close(force: true);
  print(jsonEncode(results));
}
