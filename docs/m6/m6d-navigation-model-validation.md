# M6-D — Navigation Model Validation

**Architecture validation only. No schema, analyzer, compiler or generator change was made; the working
tree is unchanged apart from this document and [ADR-0025](../adr/0025-the-navigation-model.md).**

The question was whether the navigation model can survive M7 and future generators without redesign. It
can, with one amendment — and the corpus disproves three things the codebase currently believes.

---

## 1. Corpus measurement (Phase 1)

Every available project. Counts are **occurrences of each construct in hand-written `lib/` Dart**,
comment-only lines excluded, generated files (`.g.dart`, `.freezed.dart`, `.gr.dart`, `.mocks.dart`)
excluded. Not estimates.

| | hello_bridge | examples/counter | e2e/counter | spike/app_b | continuum | unichat | **total** |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| files | 7 | 1 | 1 | 10 | 159 | 113 | 291 |
| lines | 369 | 82 | 82 | 505 | 31 642 | 47 796 | 80 476 |

### Declarative route surface

| Construct | hb | cnt | e2e | spike | continuum | unichat | **total** |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `home:` | 1 | 1 | 1 | 0 | 4 | 1 | **8** |
| `routes:` | 0 | 0 | 0 | 1 | 0 | 0 | **1** |
| `initialRoute` | 0 | 0 | 0 | 1 | 0 | 0 | **1** |
| `onGenerateRoute` | 0 | 0 | 0 | 1 | 0 | 2 | **3** |
| **`builder:` (route)** | 1 | 0 | 0 | 1 | 22 | 116 | **140** |
| `builder:` (other) | 1 | 0 | 0 | 4 | 1 | 42 | 48 |

`builder:` is split because counting it whole is meaningless — `StreamBuilder`, `LayoutBuilder` and
`FutureBuilder` spell their parameter the same way. **Route builders** are those inside a
`MaterialPageRoute` / `PageRouteBuilder` / `showDialog` / `showModalBottomSheet` / `showGeneralDialog`
argument list, counted by paren-matching.

### Imperative navigation

| Construct | continuum | unichat | spike | **total** |
| --- | ---: | ---: | ---: | ---: |
| **`Navigator.pop`** | 16 | 117 | 2 | **135** |
| `Navigator.push` | 14 | 48 | 0 | **62** |
| `Navigator.pushNamed` | 0 | 13 | 2 | **15** |
| `Navigator.pushReplacement` | 0 | 6 | 0 | **6** |
| `Navigator.popUntil` | 0 | 6 | 0 | **6** |
| `Navigator.maybePop` | 0 | 2 | 0 | **2** |
| `MaterialPageRoute` | 16 | 75 | 1+1 | **93** |
| `ModalRoute` | 0 | 1 | 0 | **1** |

Verified rather than assumed: the `.pop(` regex matches any receiver, so unichat's 117 were broken down by
receiver — `Navigator` 86, `…(context)` 26 (i.e. `Navigator.of(context).pop`), `root` 2, `local` 2,
`modalCtx` 1. All 117 are navigator pops; the last five are *nested-navigator* handles (§4.5).

### Overlays

| Construct | continuum | unichat | **total** |
| --- | ---: | ---: | ---: |
| `showDialog` | 6 | 17 | **23** |
| `showModalBottomSheet` | 0 | 21 | **21** |
| `showSnackBar` | 3 | 1 | **4** |
| `PopupMenuButton` | 0 | 1 | **1** |

### Shell / structural navigation

| Construct | continuum | unichat | **total** |
| --- | ---: | ---: | ---: |
| `TabBar` / `TabBarView` / `TabController` | 0 | 2 / 2 / 2 | **6** |
| `DefaultTabController` | 0 | 1 | **1** |
| `PageView` / `PageController` | 1 / 1 | 1 / 1 | **4** |
| `IndexedStack` | 0 | 1 | **1** |
| `PopScope` | 0 | 3 | **3** |

### Nested navigation and out-of-tree navigation

| Construct | unichat |
| --- | ---: |
| `GlobalKey<NavigatorState>` | 4 |
| `navigatorKey:` | 1 |
| `Navigator(` (a nested navigator widget) | 1 |

### Measured as **zero** in every project

`onUnknownRoute`, `pushReplacementNamed`, `pushAndRemoveUntil`, `popAndPushNamed`, `CupertinoPageRoute`,
`PageRouteBuilder`, `PopupRoute`, `RouteSettings` *(as a constructor)*, `showBottomSheet`, `showMenu`,
`showGeneralDialog`, `Overlay.of`, `OverlayEntry`, `Drawer`, `endDrawer:`, `NavigationRail`,
`BottomNavigationBar`, `NavigationBar`, `Router(`, `RouterDelegate`, `RouteInformationParser`,
`WillPopScope`, **`go_router`**, `context.go`, `context.push`, **`auto_route`**, **`beamer`**, `fluro`,
`routemaster`.

### Three things this contradicts

1. **C1: "`go_router` is the dominant navigation shape in real apps."** Zero `GoRoute`, zero `GoRouter`,
   zero `context.go`, across 80 476 lines of two production applications. `Navigator` + `MaterialPageRoute`
   is universal here. `app.RouteTransition`'s design was justified partly by C1's claim; the claim does not
   hold for this corpus and should not be relied on again without re-measuring.
2. **BRG3008: "on the evidence available — one push, in one fixture."** The corpus has **62** pushes and
   **93** `MaterialPageRoute`s. M5-A already measured BRG3008 ×17. The number the refusal rests on is wrong
   by more than an order of magnitude, in a message users read. See §5.
3. **M4-G built shells (`Drawer`, `NavigationRail`, `BottomNavigationBar`).** All three are **zero** in the
   corpus. Not wasted — but shell navigation is not what these applications do, and it should not be
   weighted against the items that measure in the dozens.

---

## 2. The dominant real-world routing shape

unichat — the largest application — routes through neither `routes:` nor `go_router`. It uses
`onGenerateRoute` pointing at a static function (`mobile/lib/router.dart`):

```dart
class AppRouter {
  static Route<dynamic> generateRoute(RouteSettings settings) {
    switch (settings.name) {
      case '/chat':
        final args = settings.arguments! as Map<String, dynamic>;
        return MaterialPageRoute(
          builder: (_) => ChatScreen(
            conversationId: args['conversationId'] as String,
            participantId:  args['participantId']  as String,
          ),
          settings: settings,
        );
      …
```

Everything a route table needs is **statically present**: the case labels are string literals, the
destination is a named component, and the arguments are unpacked by literal key with a declared cast. This
is a route table written as a `switch`.

It is driven from outside the widget tree:

```dart
notificationService.onReturnToCall = () {
  _navigatorKey.currentState?.pushNamed(route, arguments: {'peerId': …, 'isIncoming': false});
};
```

**No `BuildContext`, no widget callback, no component.** A push-notification handler navigating through a
`GlobalKey<NavigatorState>`. `app.RouteTransition.source` is defined as *"the component the navigation
happens from"* — for these call sites there is none.

---

## 3. Information-loss trace (Phase 2)

Each form was run through the **real pipeline on a real Flutter project** — `flutter pub get`,
`bridge build`, reading the emitted `.bridge/uir.ndjson`. Not the stand-in fixture: see the correction in
§6.

| Form | Analyzer | UIR | Normalize | Generator | Verdict |
| --- | --- | --- | --- | --- | --- |
| `home: X()` | extracts args | `app.Route` + args on the slot `ui.Element.props` | passes both | cannot link them | **BRG3018** — link missing |
| `routes: {'/b': (c) => X(id:…)}` | same | 2 × `app.Route`, args on the element | passes | same | **BRG3018** — *same gap, both forms* |
| `Navigator.push(MaterialPageRoute(builder: …))` | ✅ full | `app.RouteTransition` **with `arguments` and `transport:"primitive"`** | N11 classifies | no link to the call site | **BRG3008 + BRG3013** |
| `Navigator.pushNamed('/b', arguments: {…})` | partial | `app.RouteTransition` with `target` — **`arguments` absent** | — | — | **args lost**, new finding |
| `Navigator.pop()` | — | **no node at all** | — | — | **BRG3013**, owner: schema |
| `showDialog(builder: …)` | tree extracted | **no node at all** | — | — | **BRG3006** — *blames the program*, see §5 |
| `onGenerateRoute: fn` | refuses | **no `app.Route` at all** | — | — | **BRG1304**, stated cause too strong (§5) |

Two of these are worth stating precisely, because they are the opposite of what the older documents assume.

**The inline push loses nothing.** The emitted node is complete:

```json
{"kind":"app.RouteTransition","component":"6755090ef349b8db","source":"46a5c0c577868805",
 "arguments":[{"name":"id","transport":"primitive",
               "binding":{"kind":"bind.Const","value":"inline"}}]}
```

Destination, argument name, value, and the URL-boundary transport — all present. **The only missing thing
is a link from this edge to the call expression that performs it**, which is exactly ADR-0024's finding and
what `BRG3013`'s message already says.

**`pushNamed` is the one that genuinely loses data.** Its transition carries `target` and **no
`arguments`** — the `arguments: {'id': '7'}` map survives only as a `logic.MapLit` in the expression realm,
unattached to the edge. This is a second, distinct gap from ADR-0024's, and it is the form the corpus's
out-of-tree navigation uses (15 uses, all named).

---

## 4. The minimum model (Phase 3)

### Does `app.Route` remain sufficient? **Yes, for what it models.**

It correctly models a *place in the application*: path, component, params, guards, meta. Both declarative
forms (`home:`, `routes:`) already produce correct `app.Route` nodes. It needs **one** additive field
(`arguments`), and the vocabulary for it — `RouteArgument`, `RouteArgumentTransport` — already exists and
is already carried by `app.RouteTransition`. The asymmetry is the defect, not the model.

### Should `app.Route` become a graph? **No, and the corpus says why.**

A graph would model reachability — which route can reach which. N11 already computes that from
`app.RouteTransition` edges, and 135 pops make the "edges" question misleading anyway: **the most frequent
navigation operation in the corpus does not create an edge at all**, it returns along one. Promoting
`app.Route` to a graph would encode a structure the application does not have. The nav graph is the
transition set; the route set is the node set; that separation is correct.

### Should transitions become executable nodes? **No — but something must be.**

`app.RouteTransition` is a *declarative edge* and is the input to N11 (ADR-11). Making it executable would
overload one node with two jobs and break N11's contract. What is missing is a **statement** that says
*perform this transition here* — ADR-0024's Option B, `logic.Navigate`.

The corpus makes the choice between ADR-0024's options unambiguous, which its own text could not:

| | Option A `site: NodeId` on the edge | **Option B `logic.Navigate` (recommended)** |
| --- | --- | --- |
| inline push (62) | works | works |
| `pushNamed` (15) | works | works |
| **`pop` (135)** | **cannot** — §A17.3 says a pop is not a transition, so there is no edge to hang `site` on | `logic.Navigate` with no transition — *precisely* §A17.3's "return along an edge that already exists" |
| overlays (44) | needs a transition per dialog | an inline destination like any other |

**Option A cannot express the single most common navigation verb in the corpus.** That is the deciding
evidence, and it was not available when ADR-0024 was written.

### Does the model require a new concept? **One, plus two fields.**

Full statement in [ADR-0025](../adr/0025-the-navigation-model.md).

---

## 5. Diagnostic audit (Phase 5)

Audited across all three domains. **No diagnostic was weakened; none was changed at all** — this milestone
forbids code changes, so the findings below are recommendations with evidence.

| Code | Verdict |
| --- | --- |
| BRG1307 `malformedTransition` | ✅ root cause; correctly self-blames the compiler |
| BRG1308 `unresolvedRoute` | ✅ root cause; links upstream to BRG1304 |
| BRG2301 live object across a route boundary | ✅ best user-facing explanation in the set — *"a user who reloads the page… has no object to pass"* |
| BRG2302 promotion | ✅ root cause, correctly `info` |
| BRG2303 unpromotable callback | ✅ mostly — one of three reason strings, *"a value the compiler has no id for"*, is a symptom; the comment beside it names the real cause (BRG2105) and the message does not |
| BRG2110 widget list in props | ✅ **after correction** (M4-G→M5-A). A residual clause from the superseded diagnosis still sits mid-message |
| BRG3013 `UnsupportedCapability` | ✅ root cause **and** owning layer — this is the model |
| BRG3018 `RouteComponentArguments` | ✅ verified **against the schema, not its own prose**: `app.Route` still has no `arguments`, and v2.5 did not add one |
| **BRG3008 `UnroutableDestination`** | ⚠️ **stated cause invalidated — the one to fix** |

### BRG3008 — invalidated twice

Its message tells the user:

> *…a legalization decision this generator declines to make on the evidence available — **one push, in one
> fixture**.*

1. **The evidence premise is stale.** M5-A measured BRG3008 ×17; this corpus has 62 pushes and 93
   `MaterialPageRoute`s. The apps the source header says "are not in this repository" have since been run.
2. **The root cause moved layers.** ADR-0024 re-diagnoses it: the generator is *correct*, the kit's
   `Destination` union mirrors §A17, and what is missing is a UIR construct. So the blocker is not an
   unmade decision awaiting evidence — it is a missing node kind owned by the **schema**.

The correct wording already exists twenty lines away, in the capability table
(`unsupported.ts`, `owner: 'schema'`): *"what is missing is a link from an `app.RouteTransition` to the call
expression that performs it."* `BRG3013` was fixed to say this; `BRG3008` was not, and both fire on the same
missing construct.

**Recommendation:** restate BRG3008 in BRG3013's terms and cite ADR-0024. Not a weakening — it stays an
error, and it becomes *more* specific about who owns the fix.

### `showDialog` falls through to BRG3006

Found by running, not by reading:

```text
error [BRG3006] `showDialog` is not declared in this program, so there is nothing to emit for it.
```

That is the generic "your program is missing something" message the capability table exists to abolish —
and it blames the user's program for a compiler gap. `SnackBar`, `BottomSheet`, `ScaffoldMessenger`,
`PopupMenuButton` and `DropdownButton` all have capability entries; **`showDialog` (23 uses) and
`showModalBottomSheet` (21 uses) — the two most frequent overlay calls in the corpus — do not.**

**Recommendation:** add capability entries for both, `owner: 'schema'`, pointing at ADR-0024/0025. Two data
rows, no logic.

### BRG1304 on `onGenerateRoute` — too strong

> *onGenerateRoute builds routes at runtime, so they cannot be read into a static route graph.*

True of an arbitrary function. **False of the only shape the corpus uses** — a `switch` on string literals
returning `MaterialPageRoute`s (§2). The refusal to guess is right and must stay; the *stated cause* over-
claims, asserting impossibility where the honest statement is that this analyzer does not read that shape
yet. See ADR-0025 §6.

### One reference defect

**`ADR-11a` is cited by six code sites as if it were a document.** No such file exists in `docs/adr/`; it is
a *section* inside `0011-cross-route-state-promotion.md`. Anyone grepping for `0011a` finds nothing. Cheap
to fix by citing `ADR-11 §a`.

---

## 6. A correction I had to make mid-measurement

The first pass of the Phase 2 probe ran against the analyzer's **stand-in Flutter** test fixture and showed
`Navigator.pop`, `pushNamed` and `showDialog` each turning the whole enclosing `TextButton` into a
`ui.Opaque`. The obvious reading — *"a single navigation call makes an entire widget subtree
unrenderable"* — would have been a dramatic and completely false finding.

The control disproves it: `TextButton(onPressed: () {}, child: Text('x'))`, with an **empty** callback,
goes opaque identically. `TextButton` is opaque in that fixture for reasons that have nothing to do with
navigation. Every Phase 2 result above was re-run on a real Flutter project instead.

Two earlier measurement errors in this milestone were caught the same way and are recorded so the next
person does not repeat them:

- `^`-anchored patterns compiled **without `re.M`** silently matched only at file start, zeroing four
  counters.
- Excluding directories named `macos` to skip platform scaffolding **dropped most of continuum**, whose
  application lives at `apps/macos/mac/lib`. Scoping to `lib/` is the correct filter.

---

## 7. Deliverables

- **Corpus measurements** — §1, and the raw per-file JSON was produced by a scratch script (not committed;
  the tables here are the artifact).
- **Navigation taxonomy** — §3's table: *declarative place*, *edge*, *performance of an edge*, *return
  along an edge*, *inline destination*. Five kinds, not one.
- **Architecture recommendation** — §4: `app.Route` stays, gains `arguments`; `app.RouteTransition` stays
  declarative; add `logic.Navigate`.
- **Proposed ADR** — [ADR-0025](../adr/0025-the-navigation-model.md).
- **Migration strategy** — ADR-0025 §7.
- **Engineering report** — this document.
