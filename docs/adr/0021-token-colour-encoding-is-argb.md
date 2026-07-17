# ADR-21 — A colour token's value is ARGB when it is eight digits

- **Status:** Accepted (M3-B). States a contract Spec v2.0 §2.5 / ADR-13 left unstated. **No schema change.**
- **Date:** 2026-07-17

## The defect

`app.Token.light` and `.dark` are `unknown` in the schema — `x-uir-json: true`, "untyped JSON, shape varies
by `group`". For `group: 'color'` the value is a hex string. **Nothing, anywhere, says what the digits mean.**

Two producers already disagree about how many there are:

| producer | code | emits |
| --- | --- | --- |
| the analyzer, for a colour the author wrote | `flutter_adapter.dart:285` — `'#${(colour & 0xFFFFFFFF).toRadixString(16).padLeft(8, '0').toUpperCase()}'` | **8 digits** — `#FFF6F6FA` |
| N10, for a colour it derived | `n10_theme_tokenize.ts:138` — `hexFromArgb(dynamic.getArgb(schemeLight)).toUpperCase()` | **6 digits** — `#6750A4` |

Both are correct for what they are. The analyzer is formatting a Flutter `Color`, whose `value` is
`0xAARRGGBB` — alpha first. `hexFromArgb` drops the alpha and returns `#RRGGBB`. So a single normalized
document legitimately contains both shapes, and an eight-digit value is **ARGB**.

`@bridge/runtime-react` read it as **RGBA** — the CSS convention, where alpha is last. Measured on the first
real UIR document ever produced in this repository (`fixtures/apps/hello_bridge`, whose
`scaffoldBackgroundColor` is `Color(0xFFF6F6FA)`):

| | r | g | b | alpha |
| --- | --- | --- | --- | --- |
| what the Dart source says | 246 | 246 | 250 | 1 |
| ARGB — correct | 246 | 246 | 250 | 1 |
| RGBA — what the kit did | **255** | 246 | **246** | **0.98** |

Every channel shifted one byte, plus a spurious 98% alpha. Not a rounding error — a different colour, on
every author-stated colour, in every generated application.

The authority is not a preference. `material-color-utilities` — the package Flutter itself uses, and the one
N10 already depends on — is explicit (`utils/string_utils.js`, `argbFromHex`):

```js
else if (isEight) {
    r = parseIntHex(hex.slice(2, 4));   // digits 0..1 are ALPHA, and are skipped
    g = parseIntHex(hex.slice(4, 6));
    b = parseIntHex(hex.slice(6, 8));
}
```

N10 *reads* eight-digit input through that function, so the compiler has always interpreted eight digits as
ARGB. The kit was the only component that disagreed.

## Decision

**For `group: 'color'`, a token value is a hex string, and its length says what it is:**

| form | meaning | who emits it |
| --- | --- | --- |
| `#RRGGBB` | opaque colour | N10's derived roles |
| `#AARRGGBB` | **alpha first**, as Flutter's `Color.value` and `material_color_utilities` | the analyzer, for author-stated colours |
| `#RGB` | shorthand for `#RRGGBB` | hand-written themes and overrides |

**`#RRGGBBAA` is not a form.** CSS's ordering does not appear in this system and must not be accepted, because
`#FFF6F6FA` is valid under both readings and means two different colours. A parser that accepts both cannot
be right; it can only be lucky.

`@bridge/runtime-react`'s `parseColor` is corrected accordingly. This is the *one* runtime API change since
M3-A froze, and it is made under the "genuine architectural defect" exception.

## Why this is not a schema change

The obvious repair is to write the encoding into `l3.json`'s description for `Token.light`. It is refused:

`UIR_SCHEMA_HASH` is taken over the **raw schema bytes** (INV-5), so a comment costs a hash change, which
forces every consumer to re-read the model and invalidates every cache entry and every document minted before
it — for a sentence. v2.4 §A17 paid that price to add a field the model could not express. This states a fact
the model already implies, and which two of the three components already implement. An ADR is where a
contract that code enforces but the dialect cannot state already lives — §A17.4 says exactly that, and lists
`BRG1307` among the invariants kept in code rather than in schema.

## Consequences

- **The defect was invisible to every gate that existed.** It passes the schema (a string is a string), the
  type system (`unknown`), the whole M3-A suite (130 tests, all with `#RRGGBB` fixtures I wrote myself), and
  it would have passed CI forever. It took one real document from one real app. ADR-13 predicted the *shape*
  of this — "no golden, no pixel diff and no visual verifier would ever have caught it" is ADR-15's line
  about a different defect, but ADR-12's VR-1 exists because *"our reproduction of Flutter's `ThemeData`
  defaults may diverge from the real framework's"*. This is that risk landing, one layer lower than expected:
  not in the derivation, in the transcription.
- **Fixture colours must come from real output.** The M3-A suite's tokens were all six-digit because I wrote
  them from N10's format. The regression test for this ADR uses `#FFF6F6FA` — hello_bridge's actual value.
- **A fourth producer must obey this too.** Any future frontend emitting `app.Token` (SwiftUI's
  `Color(.sRGB)`, a Figma import) states alpha first or not at all.
