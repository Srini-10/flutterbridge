# ADR-74 — Widget-valued parameters of a project widget; input formatters; `bridge build`'s real error count

- **Status:** Accepted (M14). Found by running the two real applications through **`bridge build`** — the pipeline a user runs — rather than through `bridge generate`.
- **Date:** 2026-09-21

## A correction to the previous phase's numbers

`bridge generate` normalizes the program itself and **ignores the normalizer's errors**; `bridge build` stops on them. The phase-3 report counted `generate`'s errors (A 523, B 4 444) and so
missed that `bridge build` never reached the generator on either application: **A stopped at 1 normalizer error, B at 58** (`BRG2110` ×35, `BRG2305` ×22, `BRG2301` ×1). Those are counted now, and the
taxonomy (`docs/m14/`) reports both stages.

## Decisions

**D1 — A project widget's widget-valued parameters stay named props.** `Bar(header: Text('h'), actions: [Text('a')])` emitted `<Bar />` — **every widget and list of widgets passed to a project widget
was silently dropped**: a sole `List<Widget>` argument was inferred to be the element's `children` (erasing which parameter it was), a `Widget` argument became a `slot`, and the generator, which passes a
project widget's props *by name*, handled neither ("slots and children are not handled here"). They are now props holding widget values (`logic.WidgetExpr`, ADR-0062); the children/sole-list inference
applies to framework widgets only. Any other `List<Widget>` argument (a second list, `TabBar(tabs:)`) is extracted as widget values too, so it is UI a generator can see. `x!` on a widget is a widget value.
**D2 — `BRG2110` (N8) is for widget lists.** A list of constructions (`inputFormatters`, `DataColumn`s, chart slices) is a list of *values*; treating it as UI stopped `bridge build` on B 35 times. It fires only
for a list *typed* `List<…Widget>`, which the analyzer now never leaves as constructions.
**D3 — A widget list renders as positionally-keyed children** (`widgetNodes`: a `Fragment` of `Children.toArray`), never as an array child. React reports a missing key only on the console; the oracle harness now
**fails a scenario that logs one**, which is how the defect above was made visible — including a React quirk measured on the way (`[element, list, list]` warns; the same as fragments does not).
**D4 — `TextInputFormatter`s.** `inputFormatters:` was *dropped with a warning* on both text fields. `FilteringTextInputFormatter.digitsOnly` and `LengthLimitingTextInputFormatter(n)` (graphemes, not UTF-16 units)
are implemented and applied in order to every edit; an edit a formatter rejects is not reported to `onChanged` (all measured in `flutter test`). `allow`/`deny` need a `RegExp` and are refused (`RegExp` is refused everywhere).
`TextFormField` forwards every parameter the shared editing surface has (it dropped `maxLength`, `maxLines`, `focusNode`, `textInputAction`, … with a warning); `autovalidateMode` is refused (the schedule differs).
**D5 — Framework statics and functions carry their library.** `debugPrint`, a framework top-level variable of function type, and static fields of framework classes are named by library, like an SDK static.

## Evidence

`fixtures/apps/widget_props` and `fixtures/apps/formatters` compared with `flutter test` (a header, two lists, nullable widget, conditional/spread/for elements that grow; formatters alone, combined, rejected edits,
emoji), a Chromium check in production and development with no React warning; analyzer test that pins the name-preserving extraction (a mutant that restores the old inference is killed); five formatter mutants and
three widget-prop mutants killed.
