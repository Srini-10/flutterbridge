/// A single row rendered by the Home screen.
///
/// Extraction target: an L1 `ClassDecl` with three `FieldDecl`s plus a static `fromJson`, which the
/// contracts generator turns into a TS type + schema at M6.
class Item {
  const Item({required this.id, required this.title, required this.body});

  final int id;
  final String title;
  final String body;

  static Item fromJson(Map<String, dynamic> json) {
    return Item(
      id: json['id'] as int,
      title: json['title'] as String,
      body: json['body'] as String,
    );
  }
}
