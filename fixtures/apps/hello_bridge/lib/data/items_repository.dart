import 'dart:convert';

import 'package:http/http.dart' as http;

import '../constants.dart';
import '../models/item.dart';

/// The fixture's only network call: `http.get` + JSON decode, consumed by a `FutureBuilder`.
///
/// Extraction target: an `app.Endpoint` (GET /posts) — the input the OpenAPI generator (M3) and the
/// Fastify BFF generator (M6) both read, without either of them ever parsing this file.
class ItemsRepository {
  const ItemsRepository();

  Future<List<Item>> fetchItems() async {
    final http.Response response =
        await http.get(Uri.parse('$apiBaseUrl/posts?_limit=12'));

    if (response.statusCode != 200) {
      throw Exception('Failed to load items (${response.statusCode})');
    }

    final List<dynamic> decoded = jsonDecode(response.body) as List<dynamic>;
    return decoded
        .map((dynamic entry) => Item.fromJson(entry as Map<String, dynamic>))
        .toList();
  }
}
