# Generator taxonomy — Application B (21 packages, 127 routes)

`bridge build` stages: analyze ok → normalize FAILED.
Normalizer errors: **23**. Generator errors (past the normalizer): **5451**. Unique root causes: **26**.

Occurrences by category — A (contract bug): 0; B (browser-compatible, not implemented): 1614; C (library adapter): 3829; D (no browser equivalent): 26; unclassified: 5.

| Count | Stage | Cat | Root cause | First failing layer | Codes | ADR |
| ---: | --- | --- | --- | --- | --- | --- |
| 1566 | generate | C | Riverpod: ref.watch/read/listen, providers, notifiers | analyzer (no model of ConsumerWidget/ref) | BRG3006, BRG3013 | 0073 |
| 653 | generate | C | a name with no declaration in the program (usually a package or a private symbol from a construct above) | generator | BRG3006, BRG3013 | 0073 |
| 484 | generate | B | a theme built by a helper/ColorScheme from computed values: no token for the Material role a widget paints | analyzer (token extraction) | BRG3010 | 0073 |
| 462 | generate | C | named arguments to a package/SDK callee the kit does not mirror (Supabase, showModalBottomSheet, Color ops, …) | generator (no callee signature for a package/SDK function) | BRG3002, BRG3013 | 0073 |
| 351 | generate | C | construction of a class that depends on an unsupported package | generator | BRG3002, BRG3013 | 0055 |
| 288 | generate | B | Theme.of(context)/extension<T>() and design-system extensions on BuildContext | analyzer/generator (no theme-extension model) | BRG3004, BRG3006, BRG3013 | 0073 |
| 260 | generate | C | member of a package class with no runtime model (dio beyond the subset, audio, Supabase, …) | generator | BRG3013 | 0073 |
| 249 | generate | B | a construct the generator names as unsupported | generator | BRG3013 | 0073 |
| 247 | generate | B | an expression the analyzer preserved verbatim (opaque) | analyzer | BRG3004 | 0058 |
| 226 | generate | C | a top-level provider whose initializer builds a package object | generator | BRG3013 | 0073 |
| 114 | generate | B | a widget with no runtime mapping | generator (widget map) | BRG3001 | 0062 |
| 112 | generate | C | a top-level/static variable whose initializer contains any construct above | generator (cascade) | BRG3013 | 0073 |
| 101 | generate | C | a project class extending a package class (StateNotifier, Notifier, …) | generator | BRG3013 | 0073 |
| 98 | generate | C | a top-level function whose body contains any construct above | generator (cascade) | BRG3013 | 0066 |
| 57 | generate | B | two project widgets of the same name in different libraries (monorepo) emit to one file: refused; needs unique component file/export naming | generator | BRG3009 | 0047 |
| 56 | generate | B | an expression form with no lowering | generator | BRG3002 | 0058 |
| 36 | generate | B | a typed catch on a type that cannot be tested at runtime | generator | BRG3003 | 0061 |
| 26 | generate | B | a colour computed at runtime | analyzer (colour hoisting) | BRG3014 | 0076 |
| 25 | generate | D | a GlobalKey: a handle on a live widget State, no UIR construct | generator | BRG3015 | 0058 |
| 22 | normalize | B | a screen's own constructor parameter forwarded across a route boundary (N11 multi-hop provenance) | normalizer | BRG2305 | 0025 |
| 20 | generate | B | a navigation that constructs its destination inline | analyzer/generator | BRG3008 | 0072 |
| 9 | generate | B | a widget parameter the runtime cannot honour (refused by name) | generator (widget map) | BRG3017 | 0070 |
| 5 | generate | ? | unclassified — needs a rule | ? | BRG3001, BRG3012 |  |
| 5 | generate | B | a MaterialApp parameter with no equivalent (builder, onUnknownRoute, localization, …) | generator (app root) | BRG3016 | 0029 |
| 1 | normalize | D | a live object passed across a route boundary (a URL carries an identifier, not an object graph) | normalizer | BRG2301 | 0025 |
| 1 | generate | B | interpolating a value whose Dart text cannot be reproduced from its static type (num, enum, class, dynamic elements) | generator | BRG3002 | 0073 |
