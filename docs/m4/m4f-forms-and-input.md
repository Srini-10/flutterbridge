# M4-F — Forms and text input

**Goal:** implement the input foundation real Flutter applications need.

**Status: complete.** Text input, forms, validation, focus and the four selection controls work end-to-end.
**No schema change, no new ADR, no new compiler pass** — the pipeline already carried the controller model,
and §1's evidence step is what proved it.

CI green: 207 analyzer tests + `dart analyze` clean, 28 `bridge_uir`, 22/22 TS test tasks (**334** runtime,
**97** generator, 126 compiler), 18/18 typecheck, `codegen:check` OK, `lint:stubs` OK.

---

## 1. Analyzer observations — the evidence that changed the design

The milestone began by running the real analyzer over a sign-up screen, as §1 requires. **The result
overturned a triage conclusion this project had been carrying since M4-A**, which listed "controlled inputs
and controllers" as needing an ADR before anything could be built. It did not:

| Written in Dart | Extracts as |
| --- | --- |
| `final TextEditingController _email = TextEditingController();` | **`sig.Signal`**, `scope: component`, `type: TextEditingController` |
| `final FocusNode _emailFocus = FocusNode();` | **`sig.Signal`**, `type: FocusNode` |
| `TextField(controller: _email, …)` | `props.controller =` **`bind.Signal`** — a reactivity edge |
| `onChanged: (String value) { setState(() { _note = value; }); }` | **`logic.Lambda`** → lifted to a **`sig.Action`**, `params: ['value']` |
| `validator: (String? value) { … return null; }` | **`logic.Lambda`** with a statement body |
| `decoration: InputDecoration(labelText: 'Email')` | **`logic.New`** of a kit-provided type |
| `keyboardType: TextInputType.emailAddress` | **`logic.Ref`** — the kit-enum-value path |
| `@override void dispose() { _email.dispose(); }` | **`sig.Effect`**, `timing: unmount` |
| `Checkbox(value: _accepted, onChanged: …)` | `value: bind.Signal`, `onChanged: logic.Lambda` |

Three facts follow, and together they are why this milestone needed no architecture:

1. **A controller is state.** `TextEditingController` was already in the catalog's `stateHolders`, so a
   controller field is a component signal — exactly like an `int` counter.
2. **A callback is a closure.** ADR-19 lowers behaviour to closures, so `onChanged` needs no new construct.
3. **Disposal is already modelled.** The catalog's lifecycle map already says `dispose → unmount`.

The M4-A note was a *guess made without running the analyzer*. That is the cost this milestone's §1 was
designed to avoid, and it paid for itself immediately.

## 2. Architecture changes

None to the schema, the compiler or the catalog *shape*. What changed:

| Layer | Change |
| --- | --- |
| **Schema / compiler** | **None.** |
| **Catalog** | 8 widget entries (`TextField`, `TextFormField`, `FormField`, `Checkbox`, `Switch`, `Radio`, `Slider`, `InputDecorator`) + 5 SDK-cited component-default blocks. |
| **Runtime kit** | `internal/widgets/input.ts` (controller, focus node, decoration, decorator, fields, form) and `internal/widgets/selection.ts` (the four controls). |
| **Generator** | 10 mappings; **three real defects fixed** (below). |

## 3. Three generator defects this milestone exposed

All three were pre-existing. None had ever fired, because no earlier fixture put a *stateful callback in the
widget tree* — the corpus app's `onPressed` called a **store** action, which `rootScope` already resolved. A
form is the first screen where the pattern is unavoidable.

1. **Component-scoped actions were never declared.** Normalization lifts a `setState` callback into a
   top-level `sig.Action` and the prop becomes a `logic.Ref` to it. Nothing declared those in the component,
   so every one became `BRG3006`. They are now emitted as typed local closures before the tree that calls
   them — `declareLocalActions`, resolving by `target` rather than by parsing the synthetic `action$…` name.

2. **A lambda with a statement body was half-lowered.** It warned, then handed the statement *array* to the
   expression emitter, which reported `<unknown>` — a warning followed by an error and no output. Every form
   validator has this shape. It now lowers to a block-bodied arrow, via a one-way wiring hook
   (`setStatementLowering`) because a mutual import would be a cycle `.dependency-cruiser.cjs` rejects.
   A lambda's own parameters are now in scope inside its body, which they were not.

3. **Every nullable primitive typed as `unknown`.** A `TypeRef.name` is the analyzer's `getDisplayString()`,
   which spells a nullable type `bool?` — *and* sets `nullable: true` separately. The primitive table is keyed
   by `bool`, so the lookup missed. `onChanged: (bool? value)` — Flutter's own tristate-checkbox signature —
   emitted `unknown | null`, and `value ?? false` then had type `{}`, which does not assign to `boolean`.

A fourth was mine, caught before it shipped: I first wrote the `Form` field registry as a **module-scope
mutable object**, which is precisely the INV-19 / ADR-15 defect this project exists to prevent — on a server,
one user's form would collect another user's fields. It is a provider-scoped context, and a test asserts two
forms do not share a registry.

## 4. The controller model

`TextEditingController.text` is backed by a `WritableSignal<string>`. ADR-4's ruling makes this exact rather
than approximate: *a signal write **is** the notification*, so a `ChangeNotifier` needs no listener plumbing —
reading `text` subscribes, writing it re-renders every reader.

The generated code is the proof:

```tsx
const [_email] = useState(() => signal(new TextEditingController()));
const handle_8c1f32c5 = (value: string) => { _note.set(value); };
…
<TextField controller={useSignal(_email)} onChanged={handle_8c1f32c5}
           decoration={new InputDecoration({ hintText: 'you@example.com', labelText: 'Email' })}
           keyboardType={TextInputType.emailAddress} textInputAction={TextInputAction.next} autofocus={true} />
<Checkbox onChanged={handle_7dc61292} value={useSignal(_accepted)} />
```

**Where it honestly diverges**, stated rather than papered over:

- **Cursor position.** Flutter's controller owns a `selection`; React preserves the caret when the value it
  receives matches what was typed — which a synchronous signal write produces. Where `onChanged` *transforms*
  the text, the caret jumps to the end, here and in every React controlled input. Fixing it needs `selection`
  on the controller plus a post-paint `setSelectionRange`, which is a layout write this kit does not do.
- **Validation timing.** Flutter runs validators when a `Form` is validated; this runs them on edit *and* on
  submit. More eager, never less.
- **The label does not float.** Flutter animates it into the border's notch; the animation engine is M5. The
  label sits where it ends up, so the *transition* is what is missing rather than the layout.

## 5. Diagnostics

| Code | Severity | Meaning |
| --- | --- | --- |
| `BRG3015` `UnsupportedGlobalKey` | error | A `GlobalKey` — a handle on a live widget's `State`. Reported at its **construction**, the root of the pattern, rather than at `currentState!.validate()`, so the message names the cause. Owner: **schema**. |

`Form` + `GlobalKey` is Flutter's own way to validate imperatively, and UIR has no construct that denotes "the
mounted element over there". What *is* reachable is submission, and the kit's `Form` validates every
registered field on submit — so forms work; only Flutter's imperative trigger does not.

Seven entries left `MISSING_CAPABILITIES` because they are now genuinely supported. Two were **re-classified
rather than removed**: `CheckboxListTile` is now `owner: generator` ("a mapping — it is a `ListTile` and a
`Checkbox` composed, and both exist"), and `DropdownButton` keeps `owner: adr` but for the *menu overlay*, not
for inputs. No diagnostic was weakened.

## 6. Corpus coverage delta

| | M4-D | M4-E | M4-F |
| --- | --- | --- | --- |
| Supported instantiations | 856 (44.3%) | 879 (45.5%) | **885 (45.8%)** |
| Classified unsupported | 246 (12.7%) | 227 (11.7%) | **221 (11.4%)** |
| Unknown (the apps' own widgets) | 831 | 827 | 827 |

The two corpus apps are a museum guide and a travel browser — neither is form-heavy, so the instantiation
delta is small and *expected to be*. The compatibility gain is categorical rather than numeric: **an
application with a login screen, a search box or a settings page could not be compiled at all before this
milestone, and can now.** The three generator defects fixed here also unblock every `setState` callback in a
widget tree, which is not an input-specific pattern.

## 7. Determinism proof

```
f29258d17fdf0a564914d39147ed590a808d83a3ce7a585701dc51ab92275edb   (3 independent normalize runs)
f29258d17fdf0a564914d39147ed590a808d83a3ce7a585701dc51ab92275edb
f29258d17fdf0a564914d39147ed590a808d83a3ce7a585701dc51ab92275edb
```

Preserved by construction: lifted-action handlers are named from their node id and emitted in sorted id order,
so a name never depends on walk order. The analyzer golden is pinned at `94ff520f…`.

## 8. Incremental proof

**Fixed point** — `normalize(normalize(x)) == normalize(x)`:

```
f29258d17fdf0a564914d39147ed590a808d83a3ce7a585701dc51ab92275edb   n1.ndjson
f29258d17fdf0a564914d39147ed590a808d83a3ce7a585701dc51ab92275edb   nn.ndjson
```

17 analyzer nodes → 67 normalized. **Incremental ≡ clean** holds via `generate.test.ts` and the analyzer's
incremental suites.

## 9. Benchmark comparison

| Measure | M4-E | M4-F | Δ |
| --- | --- | --- | --- |
| Analyzer (build proof) | 2.03–2.08 s | 2.14–2.23 s | +0.1 s — the fixture grew by a whole form |
| `bridge normalize` | 0.08 s | 0.08 s | none |
| Runtime kit bundle | 73,320 B | 88,695 B | +21% (12 components) |
| Runtime tests | 306 | 334 | +28 |
| Generator tests | 93 | 97 | +4 |

No optimization was done, because no bottleneck was measured. The analyzer delta tracks fixture size, not a
regression: the proof app gained seven input widgets, a controller, a focus node and four lifted actions.

## 10. Remaining blockers before M4 is complete

1. **The gesture model (21 uses, runtime).** Now the largest *reachable* gap and the one with the most
   downstream: `InkWell`, `ListTile.onTap`, `Chip.onDeleted`, and the state layers `ThemeSurface.stateLayer`
   already composes. Nothing about it needs an ADR.
2. **The animation engine (36 uses, runtime).** Still the largest gap overall; still deferred to M5.
3. **`Matrix4` / `Transform` (33 uses, runtime).** Still the best effort-to-coverage ratio available.
4. **The constraint model's measuring half (31 uses, runtime).** Needs an SSR-time layout decision.
5. **The sliver protocol (28 uses, ADR).**
6. **`GlobalKey` (schema).** New this milestone. Blocks imperative form control, and any other reach into a
   mounted widget's state. The smallest honest fix is a UIR construct for a keyed element handle — which is a
   schema change and therefore an ADR.

**Recommendation:** take the **gesture model** next. It is runtime-only, needs no ADR, and every Material
component whose colours, dimensions and state-layer opacities are already in the catalog is waiting on it —
including the `Ink`/`InkWell` pair M4-E built the paint for.
