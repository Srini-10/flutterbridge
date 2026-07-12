class Product {
  const Product({
    required this.id,
    required this.title,
    required this.price,
    required this.rating,
  });

  final int id;
  final String title;
  final double price;
  final double rating;

  static Product fromJson(Map<String, dynamic> json) {
    return Product(
      id: json['id'] as int,
      title: json['title'] as String,
      price: (json['price'] as num).toDouble(),
      rating: (json['rating'] as num?)?.toDouble() ?? 0,
    );
  }
}
