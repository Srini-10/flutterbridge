// The application root — the widget that is *not* rendered, because the project already is it.
//
// ## What M4-G's evidence run found
//
// Running the real analyzer over a realistic application shell and reading the output — rather than reasoning
// from the widget list — showed that a `MaterialApp` is empty by the time a generator sees it. Every one of
// its load-bearing parameters has already been consumed by an earlier stage:
//
// | Written in Dart | Where it has already gone |
// | --- | --- |
// | `home: HomeScreen()` | an `app.Route` at `/`, made by the analyzer's route extractor |
// | `routes: {'/details': …}` | one `app.Route` each |
// | `theme:` / `darkTheme:` | `app.Token`s, which N10 expands into the 46-role Material palette |
// | `initialRoute:` | the route table's `initial` |
//
// And the emitted project *is* the rest of it. `providers.tsx` wraps the tree in `ThemeProvider`,
// `RouterProvider` and `AssetProvider`; `layout.tsx` is the document; `page.tsx` renders the route at `/`.
// A `MaterialApp` component in the kit would mount the whole application a second time, inside itself.
//
// So an app root is **consumed, not rendered** — the same treatment `routes:` and `theme:` already get,
// applied to the widget that carried them. The component whose render tree is one emits no file.
//
// ## Why the unmodelled props are reported rather than dropped
//
// `MaterialApp` has parameters the scaffold genuinely does not model — `builder:` wraps every route,
// `onGenerateRoute:` computes routes at runtime, `navigatorObservers:` watches transitions. Silently
// discarding them is how a converted application loses its global error boundary and nobody finds out until
// production. Each is reported by name, with the layer that owns it.
//
// `title:` and `debugShowCheckedModeBanner:` are the exceptions and are dropped deliberately: the first is
// document metadata that Next.js takes from `app/layout.tsx`'s `metadata` export rather than from a widget,
// and the second is a debug ribbon that has no web equivalent and paints nothing an application authored.

import { GeneratorDiagnosticCode } from '../diagnostics/codes.js';

type Node = Record<string, unknown>;

/**
 * The widgets that are an application root rather than a thing on screen.
 *
 * All three are `WidgetsApp` subclasses in Flutter and all three carry the same route/theme surface; the
 * catalog gives each `slots: ["home"]`. `CupertinoApp` is here because a Cupertino application's *root* is
 * consumed identically — what differs is the Cupertino widget vocabulary inside it, which is a separate
 * catalog under ADR-18 and a separate gap.
 */
const APP_ROOTS: ReadonlySet<string> = new Set(['MaterialApp', 'CupertinoApp', 'WidgetsApp']);

/**
 * Parameters an app root carries that the emitted project does not model, and who owns each gap.
 *
 * Keyed by parameter name. Absent from this table means "consumed by an earlier stage", which is the case for
 * everything that matters — see this file's header.
 */
const UNMODELLED: Readonly<Record<string, { readonly capability: string; readonly owner: string }>> = {
  builder: {
    capability: 'a root builder — a widget wrapping every route, below the navigator',
    owner: 'the generator (it would become a nested layout in `app/layout.tsx`)',
  },
  onGenerateRoute: {
    capability: 'routes computed at runtime from a name',
    owner: 'the analyzer (a route whose path is not a literal has nothing to put in `app.Route.path`)',
  },
  onUnknownRoute: {
    capability: 'a fallback route',
    owner: 'the generator (it would become `app/[...slug]/page.tsx`)',
  },
  navigatorObservers: {
    capability: 'observing route transitions',
    owner: 'the runtime kit (the router descriptor exposes no observer hook)',
  },
  localizationsDelegates: { capability: 'localisation', owner: 'an ADR — no UIR construct models a locale' },
  supportedLocales: { capability: 'localisation', owner: 'an ADR — no UIR construct models a locale' },
  scrollBehavior: { capability: 'a scroll behaviour override', owner: 'the runtime kit' },
  themeMode: {
    capability: 'selecting light or dark at runtime',
    owner: 'the runtime kit (`ThemeProvider` resolves one brightness per tree; nothing switches it)',
  },
};

/** Whether `component`'s render tree is an application root. */
export function isAppRoot(component: Node): boolean {
  const render = component['render'];
  if (render === null || typeof render !== 'object') return false;
  const node = render as Node;
  if (node['kind'] !== 'ui.Element') return false;
  const widget = node['component'];
  if (widget === null || typeof widget !== 'object') return false;
  const name = (widget as Node)['name'];
  return typeof name === 'string' && APP_ROOTS.has(name);
}

/**
 * Reports every parameter of an app root that the emitted project does not model.
 *
 * Called instead of emitting the component. It reports rather than returns, because there is nothing to
 * return: the component produces no file, and the diagnostics are the whole output.
 *
 * @param component - the `ui.Component` whose render tree is an app root.
 * @param report - the diagnostic sink.
 */
export function reportAppRoot(
  component: Node,
  report: (code: string, severity: 'error' | 'warning' | 'info', message: string, nodeId?: string) => void,
): void {
  const render = component['render'] as Node;
  const widget = render['component'] as Node;
  const props = render['props'];
  const name = String(widget['name']);
  const id = typeof render['id'] === 'string' ? render['id'] : undefined;

  if (props === null || typeof props !== 'object') return;
  // Sorted, so two runs over the same program report in the same order — the diagnostics are part of the
  // output a caller diffs.
  for (const parameter of Object.keys(props as Node).sort()) {
    const gap = UNMODELLED[parameter];
    if (gap === undefined) continue;
    report(
      GeneratorDiagnosticCode.UnmodelledAppRootParameter,
      'error',
      `\`${name}.${parameter}\` has no equivalent in the emitted project. Missing capability: ` +
        `${gap.capability}. Owner: ${gap.owner}. The rest of this ${name} is not lost — \`home\`, ` +
        `\`routes\` and \`theme\` were consumed into the route table and the theme tokens before generation, ` +
        `and the App Router project is what renders them.`,
      id,
    );
  }
}
