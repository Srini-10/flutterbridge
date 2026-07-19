# M7-A — Navigation Model Implementation (ADR-0025)

**Partially delivered, and the parts are named precisely.** `logic.Navigate` exists end to end for a
**pop** — Flutter → Analyzer → UIR → Normalize → Generate → TypeScript, typechecking clean. Departures
(`push`, `replace`) reach the document but are not lowered. **One of ADR-0025's three decisions is
withdrawn as wrong**, and the evidence is below.

---

## 1. What ships

| | State |
| --- | --- |
| **D1** `app.Route.arguments` | schema only — the field exists; nothing populates or reads it yet |
| **D2** `logic.Navigate` | schema ✅, analyzer ✅ (returns), generator ✅ (`pop`), runtime ✅ (needed nothing) |
| **D3** `pushNamed` arguments | **withdrawn — the ADR was wrong** (§4) |

A pop, end to end:

```dart
onPressed: () => Navigator.pop(context),
```
```json
{"kind": "logic.Navigate", "action": "pop", "id": "d55e801d83df806d"}
```
```tsx
export function Home() {
  const router = useRouter();
  return <Scaffold body={<ElevatedButton onPressed={() => {
    router.pop();
  }} child={<Text>{'back'}</Text>} />} />;
}
```

`tsc --noEmit` on the emitted project: clean. **This is the first navigation FlutterBridge has ever
compiled.**

## 2. Schema (Phase 1)

`x-uir-version` **1.4.0 → 1.5.0**. Minor: both changes are additive and optional, so every document
written before them loads after them. `uirSchemaHash` moves `fc4e4eb130c9f948` → `9b5c1183b869601f`,
which invalidates the analyzer cache exactly once — designed behaviour (ADR-14, v2.3-amendments §M1-T5).

- **`logic.Navigate`** — a statement in the `Stmt` union, with `action` (required) and `transition`
  (optional).
- **`NavigateAction`** — `push` | `replace` | `pop` | `popUntil`, named for the **effect on the stack**
  rather than the Flutter API. `context.go` and `Navigator.pushNamed` produce the same node; ADR-0025 §5
  is why, and the M6-D corpus (zero `go_router` in two production apps) is the evidence.
- **`app.Route.arguments`** — `RouteArgument[]`, the same vocabulary `app.RouteTransition` carries.

`pushAndRemoveUntil`, `pushNamedAndRemoveUntil` and `popAndPushNamed` have **no member** in the enum. They
compose two stack effects, ADR-0025 does not model them, and all three measure **zero** in the corpus — so
they keep their existing refusal rather than being lowered to the nearer half.

## 3. Analyzer (Phase 2) — why returns and not departures

Both extraction paths are hooked, and hooking only one was a real bug caught by running:

| Source form | Path |
| --- | --- |
| `{ Navigator.pop(context); }` | `ExpressionStatement`, alongside the `setState`/`notifyListeners` splices |
| `() => Navigator.pop(context)` | the **arrow body**, which is how the corpus actually writes it |

The first implementation hooked only the statement form. The node reached UIR **zero** times, because every
real call site is a callback written with an arrow. Both now route through one `navigateOf`.

**Departures are not emitted, deliberately.** A departure needs `transition` — the `app.RouteTransition` it
performs — and transitions are referenced by `NodeId`, which is content-addressed and minted by the builder
(ADR-17). At extraction time the edge has no id to name. Emitting a departure without its transition would
say *go somewhere* and not where: strictly worse than the refusal it replaces, because the generator could
no longer tell the developer what is missing. So `push` keeps `BRG3013`.

A return needs no such reference — §A17.3 rules a pop is not a transition, so `transition` is absent by
design. **That asymmetry is exactly what decided ADR-0025 in favour of a statement over a field on the
edge, and it is why the returns were implementable first rather than by convenience.** Returns are also the
majority: 143 uses against 83 departures.

Recognition is by **resolved element** — library plus enclosing type — in the adapter layer, never by name,
and `session/extract/` still contains no package vocabulary (ADR-18).

## 4. D3 is withdrawn — the ADR was wrong

ADR-0025 D3 said `pushNamed(…, arguments: {…})` "is simply not extracted" and called it an *extraction
defect*. **It is not a defect. It is a correct, deliberate refusal**, and the code says so:

> `pushNamed(context, '/x', arguments: foo)` carries **one untyped object**, with no parameter name — and
> `RouteArgument` requires a name, because a generator has to pass it to something. We cannot name it, and
> we will not invent one, so the fact that it exists is reported rather than dropped in silence (INV-4).

Flutter's `arguments:` is a single `Object?`. It has no parameter names. In the corpus the destination
unpacks it as `args['conversationId'] as String` **inside `onGenerateRoute`** — so the correspondence
between a map key and a constructor parameter is established by code in a function the analyzer does not
read. Naming a `RouteArgument` from a map key would be inferring that correspondence, which is INV-4.

**I wrote D3 from a probe that showed the arguments absent, and concluded "missing" where the truth was
"refused on purpose".** The lesson is the one M6-D recorded and I then repeated: reading the document tells
you *what* is absent, and only the code tells you *why*.

D3 requires no work. The existing behaviour is correct.

## 5. Scope limit found during implementation — a navigation whose result is used

ADR-0025 D2 makes `logic.Navigate` a **statement**, and its table implies overlays are covered. Measured
against the corpus, that is only two thirds true:

```dart
final ok = await showDialog<bool>(...);
if (ok == true) { ... }
```

**19 measured sites** assign a navigation's result. A statement carries no value, so these cannot be
represented by D2 as written, and they keep their refusal. This is a **scope limit, not a contradiction** —
ADR-0025 never claimed to model the result — but its overlay row (44 uses) should read 25, not 44.

Closing it means either an expression form of `logic.Navigate` or a distinct node. Both are amendments and
neither is in this ADR, so neither was invented here.

## 6. Not done

| Phase | State |
| --- | --- |
| 3 — normalization | **untouched, and nothing required it.** `logic.Navigate` is a statement, not an edge, so the nav graph and N11 are unchanged — as ADR-0025 §7 predicted |
| 4 — generator | `pop` lowered; `push`/`replace`/`popUntil` refused with a capability diagnostic |
| 5 — runtime | **nothing required.** `useRouter()` already exposed `push`, `replace`, `pop`, `canPop`. ADR-0025 predicted this, and it is the strongest evidence ADR-19's descriptor boundary was drawn correctly |
| 6 — corpus/browser | hello_bridge unchanged (it has no pop); the pop slice validated on a purpose-built real project. **Continuum/unichat not re-run**; no browser test added |

D1 is schema-only: nothing populates `app.Route.arguments`, so `BRG3018` still fires. The field is in place
for the analyzer work that follows.

## 7. Validation

| Gate | Result |
| --- | --- |
| Analyzer tests | **221** pass |
| Generator tests | **150** (147 + 3 new) |
| Workspace | 22 tasks, forced non-cached |
| `dart analyze` both packages | clean |
| Determinism | byte-identical across 3 runs |
| Emitted project (`pop_app`) | **`tsc --noEmit` clean** |
| portability / stubs / codegen-check | clean |

**Mutation-tested**: removing the router hoist — so `useRouter()` would be called at the navigation site —
fails 2 tests. That mutation matters because a hook inside a callback is a *runtime* rules-of-hooks
violation React throws on, which `tsc` does not catch and which a test asserting only `router.pop()` would
have missed.

## 8. What this milestone should be remembered for

**A decision I wrote was wrong, and implementing it is what proved it.** D3 called a deliberate INV-4
refusal an extraction defect, because I had read the output and not the reason. Two milestones of corpus
measurement did not catch it; ten minutes of reading the adapter did.

The second thing: **the first version of the analyzer change emitted the node zero times in every real
application**, because it hooked the block form of a lambda body and the corpus writes the arrow form. The
unit tests would have passed. Running the real pipeline on a real project is what found it — the same
lesson as M6-E's `showDialog`, one milestone later.
