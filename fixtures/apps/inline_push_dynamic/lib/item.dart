/// A live object: it has no URL form, and the push carries it as it is.
class Item {
  const Item(this.name, this.qty);

  final String name;
  final int qty;
}
