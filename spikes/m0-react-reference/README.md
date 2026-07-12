# spikes/m0-react-reference — THROWAWAY (M0-T4)

The hand-written React output for `hello_bridge`'s **login screen**, against a **hand-rolled
10-component kit**.

**This is not `@bridge/gen-react`, and the kit is not `@bridge/runtime-react`.** Both of those are
built at M2, against the real SPI and the real visual suite. This directory exists to answer one
question early: *what should generated code look like, and can a runtime kit carry Flutter's layout
semantics on CSS?*

## Why it matters after M0

`src/screens/login-screen.tsx` is the **G2 golden target**. At M2-T18 the generator must produce code
equivalent to it, and this file is the yardstick (Blueprint §10, step 10: "commit expected TSX from
M0-T4's hand-written output for the login screen, then make the generator produce it").

It is therefore written the way a *compiler* would write it — no idiom that could not be justified
from the UIR, no cleverness a pass could not reproduce.

## The kit — exactly 10 components

| Layout (4) | Material (6) |
| --- | --- |
| `Column` · `Center` · `Padding` · `SizedBox` | `Scaffold` · `AppBar` · `Text` · `TextField` · `ElevatedButton` · `CircularProgressIndicator` |

Precisely the widgets the login screen uses. Every colour is a token (`var(--bridge-*)`) lifted from
`hello_bridge`'s `ThemeData` literals — the theme is data, which is what makes pass N10 lossless.

## Run

```bash
pnpm install --ignore-workspace   # NOT a workspace member — it is throwaway
pnpm build                        # must be green (M0-T4 acceptance)
pnpm start -p 8124                # then open http://localhost:8124/
```

## Findings

**F-layout-1 — Flutter's loose constraints are not expressible in the CSS tier.** The first render was
wrong: the form shrink-wrapped and sat at the top of the page instead of stretching full-width and
centring vertically.

Flutter's `Center` passes *loose* constraints down — the child may take up to the parent's width and
decides for itself. `Column(crossAxisAlignment: stretch)` therefore fills the width, while a bare
`Text` shrink-wraps. **CSS has no equivalent**: a flex child shrink-wraps, full stop. One CSS rule
cannot serve both children.

`Center` in this kit stretches its child, which is correct for the login screen and **wrong** for
`Center(child: Text(...))`. That is not a bug to paper over — it is exactly the case the frozen
spec's `layout-boundedness` analysis exists to detect, so that M2-T12 can choose the CSS tier or the
measured tier *per subtree*. **Recorded, not resolved.** It is the first concrete instance of risk R2.

**F-layout-2 — the fix belongs in the kit, and only in the kit.** Both defects (the `Center`
constraint above, and `Scaffold`'s body needing a definite height for its child to centre within)
were fixed by editing two kit files. `login-screen.tsx` never changed. That is ADR-6 paying for
itself on day one: the sharp edges live in one versioned place, not in ten thousand generated files.

**F-null-is-meaningful — `onPressed: null` is Flutter's disabled state.** The kit must keep `null`
distinguishable from "no handler", or every disabled button silently becomes enabled.

**F-dropped-constructs — two Dart constructs have no React representation and must be *dropped*, not
translated:** `if (!mounted) return;` (a State liveness guard; React's cleanup model makes it
meaningless), and the `isDark` / `onToggleTheme` props forwarded through `Navigator.push` — the
latter is **ISSUE-1**, open, deferred to the M0-T7 architecture review. Nothing about it is decided
here; the reference marks the exact line where the decision will land.

## Out of scope

`src/app/home/page.tsx` is a **placeholder**, not reference output. `Navigator.push` needs a
destination to exist or the transition cannot be exercised. HomeScreen is converted for real at M2.
