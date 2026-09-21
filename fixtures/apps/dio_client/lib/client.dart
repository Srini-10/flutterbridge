import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

/// A repository over Dio, the shape real applications write.
class Api {
  Api({Dio? dio})
    : _dio = dio ?? Dio(BaseOptions(baseUrl: 'http://api.test/v1', headers: {'x-app': 'bridge'}));

  final Dio _dio;

  Future<Map<String, dynamic>> item(String id) async {
    final Response<Map<String, dynamic>> response = await _dio.get<Map<String, dynamic>>('/items/$id', queryParameters: {'verbose': true, 'page': 2});
    return response.data!;
  }

  Future<int> create(String name) async {
    final Response<Map<String, dynamic>> response = await _dio.post<Map<String, dynamic>>('/items', data: {'name': name, 'tags': ['a', 'b']});
    return response.statusCode!;
  }

  Future<void> remove(String id) async {
    await _dio.delete<void>('/items/$id', options: Options(headers: {'x-reason': 'cleanup'}));
  }
}

String describe(DioException e) => switch (e.type) {
  DioExceptionType.connectionTimeout || DioExceptionType.connectionError => 'unreachable',
  DioExceptionType.receiveTimeout || DioExceptionType.sendTimeout => 'timeout',
  DioExceptionType.badResponse => 'server ${e.response?.statusCode}',
  _ => 'other',
};

class Loader extends StatefulWidget {
  const Loader({super.key, this.api});

  final Api? api;

  @override
  State<Loader> createState() => _LoaderState();
}

class _LoaderState extends State<Loader> {
  late final Api api = widget.api ?? Api();
  String status = 'idle';

  Future<void> run(Future<String> Function() body) async {
    setState(() => status = 'loading');
    try {
      final String result = await body();
      setState(() => status = result);
    } on DioException catch (e) {
      setState(() => status = describe(e));
    } catch (e) {
      setState(() => status = 'other');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> $status'),
        ElevatedButton(
          onPressed: () => run(() async {
            final Map<String, dynamic> item = await api.item('1');
            return 'item ${item['id']} ${item['echo']['method']} ${item['echo']['query']['verbose']} ${item['echo']['query']['page']} ${item['echo']['xApp']}';
          }),
          child: const Text('get'),
        ),
        ElevatedButton(onPressed: () => run(() async => 'created ${await api.create('widget')}'), child: const Text('create')),
        ElevatedButton(onPressed: () => run(() async => (await api.item('404'))['id'].toString()), child: const Text('missing')),
        ElevatedButton(onPressed: () => run(() async => (await api.item('500'))['id'].toString()), child: const Text('boom')),
        ElevatedButton(onPressed: () => run(() async => (await api.item('down'))['id'].toString()), child: const Text('down')),
        ElevatedButton(
          onPressed: () => run(() async {
            await api.remove('9');
            return 'removed';
          }),
          child: const Text('remove'),
        ),
      ],
    );
  }
}
