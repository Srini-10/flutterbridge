/// A plain, project-defined data class with two constructors, each independently proven bounded and
/// structural (ADR-0037): the unnamed one, positional (reused unmodified from M9-O), and `named`, whose
/// required named field-formals are declared in the opposite order from the fields themselves
/// (`name`, then `count`) — proving the two constructors' own mappings never overwrite one another.
class Model {
  final int count;
  final String name;

  Model(this.count, this.name);

  Model.named({required this.name, required this.count});
}
