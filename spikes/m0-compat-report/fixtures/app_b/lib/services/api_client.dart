import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/product.dart';

const String apiBaseUrl = 'https://example.invalid/api';

class ApiClient {
  const ApiClient();

  Future<List<Product>> fetchProducts() async {
    final http.Response res = await http.get(Uri.parse('$apiBaseUrl/products'));
    if (res.statusCode != 200) {
      throw Exception('Failed to load products (${res.statusCode})');
    }
    final List<dynamic> decoded = jsonDecode(res.body) as List<dynamic>;
    return decoded
        .map((dynamic e) => Product.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> submitOrder(Map<String, String> payload) async {
    await http.post(Uri.parse('$apiBaseUrl/orders'), body: payload);
  }

  /// A periodic Stream — consumed by a StreamBuilder. Streams are outside the MVP subset.
  Stream<double> priceTicker(int productId) {
    return Stream<double>.periodic(
      const Duration(seconds: 2),
      (int tick) => 10 + (tick % 5) * 0.5,
    );
  }
}
