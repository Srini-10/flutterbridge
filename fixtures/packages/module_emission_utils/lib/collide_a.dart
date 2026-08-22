// Rung P (part 1) of the M8-U reduction ladder — a top-level function name that collides with
// collide_b.dart's own declaration of the identical name, in a different file. Proves module ownership
// is derived from the source file, never from the declaration's own name.

String sameName() => 'A';
