# Generator taxonomy — Application A (240 files)

`bridge build` stages: analyze ok → normalize ok → generate FAILED.
Normalizer errors: **0**. Generator errors (past the normalizer): **537**. Unique root causes: **18**.

Occurrences by category — A (contract bug): 0; B (browser-compatible, not implemented): 173; C (library adapter): 360; D (no browser equivalent): 0; unclassified: 4.

| Count | Stage | Cat | Root cause | First failing layer | Codes | ADR |
| ---: | --- | --- | --- | --- | --- | --- |
| 108 | generate | C | Riverpod: ref.watch/read/listen, providers, notifiers | analyzer (no model of ConsumerWidget/ref) | BRG3006, BRG3013 | 0073 |
| 106 | generate | C | a name with no declaration in the program (usually a package or a private symbol from a construct above) | generator | BRG3006 | 0073 |
| 64 | generate | C | named arguments to a package/SDK callee the kit does not mirror (Supabase, showModalBottomSheet, Color ops, …) | generator (no callee signature for a package/SDK function) | BRG3002 | 0073 |
| 51 | generate | B | a theme built by a helper/ColorScheme from computed values: no token for the Material role a widget paints | analyzer (token extraction) | BRG3005, BRG3010 | 0073 |
| 38 | generate | B | Theme.of(context)/extension<T>() and design-system extensions on BuildContext | analyzer/generator (no theme-extension model) | BRG3006 | 0073 |
| 31 | generate | C | construction of a class that depends on an unsupported package | generator | BRG3002, BRG3013 | 0055 |
| 29 | generate | B | an expression form with no lowering | generator | BRG3002 | 0058 |
| 22 | generate | B | interpolating a value whose Dart text cannot be reproduced from its static type (num, enum, class, dynamic elements) | generator | BRG3002 | 0073 |
| 20 | generate | C | a top-level provider whose initializer builds a package object | generator | BRG3013 | 0073 |
| 16 | generate | C | member of a package class with no runtime model (dio beyond the subset, audio, Supabase, …) | generator | BRG3013 | 0073 |
| 14 | generate | B | an expression the analyzer preserved verbatim (opaque) | analyzer | BRG3004 | 0058 |
| 13 | generate | C | a top-level function whose body contains any construct above | generator (cascade) | BRG3013 | 0066 |
| 12 | generate | B | a construct the generator names as unsupported | generator | BRG3013 | 0073 |
| 4 | generate | ? | unclassified — needs a rule | ? | BRG3015, BRG3016, BRG3017 |  |
| 3 | generate | B | a widget with no runtime mapping | generator (widget map) | BRG3001 | 0062 |
| 2 | generate | C | a project class extending a package class (StateNotifier, Notifier, …) | generator | BRG3013 | 0073 |
| 2 | generate | B | a typed catch on a type that cannot be tested at runtime | generator | BRG3003 | 0061 |
| 2 | generate | B | a colour computed at runtime | analyzer (colour hoisting) | BRG3014 | 0076 |
