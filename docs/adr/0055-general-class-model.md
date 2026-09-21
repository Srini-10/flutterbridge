# ADR-55 — Project classes are emitted as classes; project constants as module-level constants

- **Status:** Accepted (M12, production-compatibility phase 2). Found by running a real 240-file Flutter application (read-only
  copy) through the pipeline. Supersedes ADR-0034's "does not construct" boundary for every class that is not a plain record.
- **Date:** 2026-09-21

## Context

The stock analyzer refused the application outright: **296 `BRG1201`**. Root cause (one, not 296): a declaration's symbol was keyed
by the *physical file* (`model.freezed.dart`) while every reference names its target through the *library's* root URI
(`model.dart`). Any class declared in a `part` file dangled. Symbols are now minted under the library path (`span` keeps the
physical file) — general part-file semantics, not a freezed special case.

Past that, generation failed with 639 diagnostics; 60% of them were one gap. The generator's project-class model was a type-only
interface plus bounded helper functions, with construction, inheritance, private classes and static members refused
(ADR-0034…0046). A real application is made of classes.

## Decision

**D1 — Statics.** A reference to a `static` field of a project class now has a target (its `FieldDecl`). A reachable top-level or
`static` `const`/`final` variable is emitted as a module-level `const`, retried until what its initializer reaches is emitted. A
mutable static or top-level variable is **refused by name**: it would be state shared by every request a server process handles
(INV-19). The statics of a `State` class (previously undeclared) are declared on a `ClassDecl` for it.

**D2 — A general class is emitted as a TypeScript class.** A project class that is not a plain record — or is one only for some of
its constructors — carries `library`, `isAbstract`, `typeParameters`, `interfaces`, `mixins` and **every constructor** (`ConstructorDecl`:
parameters with `initializesField`/`isSuper`, initializer list, `super(...)`, `this(...)`, redirecting factory, body). Schema:
`ClassDecl` gains those; `ConstructorDecl`, `ConstructorInit`, `ConstructorCall`, `RedirectedFactory` and `logic.TypeCheck` are new.
Each Dart constructor becomes an instance initializer `$init_<Class>[_name]` (initializers, then `super.$init_<Super>`, then the
body — Dart's order) and a static `$new$<Class>`/`$<name>$<Class>`; a factory is a static only. Names are unique per class because
TypeScript rejects an override with other parameters. Operators are `$add`, `$eq`, …. `x is T` is `dartIs(x, T)`: each class carries
`static $isA(type)`, walking superclass and interfaces lazily, so cyclic modules load.

**D3 — One calling convention.** Positional parameters, then named ones, in declaration order; **every call site passes all**,
`undefined` for an omitted one, decided from the *callee's signature*. The callee applies the Dart default with JavaScript's own
default clause; an explicit `null` is not `undefined`, so it overrides the default as in Dart.

**D4 — Implicit `this` is explicit.** Inside a general class body the analyzer rewrites an unqualified member (`value += by`, `plus(o)`)
to `this.value`, resolving the assignment's *write* element.

**D5 — A mutated object in a signal notifies it.** A method call or property write on a general-class object held by a signal,
inside a callback, is followed by `signal.touch()` (`touchAfter`). A `final` field holding an instance of a class with mutable fields is
state.

**D6 — A build-local the build mutates is refused (`BRG1313`).** ADR-0048 substitutes a build-local's initializer at every read; for
`final c = Counter(10); c.tick(); c.value` each read got its own `Counter` (Flutter: one). This was silent. A local holding a mutable
object (a list mutated by `.add`, an instance of a class with mutable fields mutated by a call or a write) is refused. Reads of an
immutable value, and of a list only read, are unchanged. `BRG1311` is untouched.

**D7 — Also.** `expression-bodied factory` bodies were dropped by the constructor extractor (kept now); `is`/`is!` were opaque (now
`TypeCheck`, with `int`/`String`/`bool`/`List`/`Map`/`Set`/`Object`/project classes lowered and others refused).

## Not covered (refused by name)

Mixins (`with`) and `mixin` declarations; extending a framework class; operators beyond the table; generic *methods*; a general class
extending a record-style one; cross-module inheritance cycles (a class and its subclass in different modules that import each other).

## Evidence

`fixtures/apps/class_model`, run by Flutter and as generated code, compared per step: unnamed/named/`const`/factory/redirecting
constructors, initializer lists, `super(...)`, super-parameters, declaration initializers, getters, methods with named and optional
parameters, operators, inheritance and `super.method()`, abstract classes, statics, `is` across a hierarchy, and a mutated `State`-held
object. `fixtures/apps/project_statics` (+ `_refusal`). Seven mutations of the class model killed (named-argument ordering, `is`
supertypes, initializer list, `super` call, object-mutation notify, operator dispatch, declaration initializers).
