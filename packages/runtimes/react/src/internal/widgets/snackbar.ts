// `ScaffoldMessenger` / `SnackBar` presentation (ADR-0030).
//
// ## Why this is provider-scoped, not a module singleton
//
// The obvious shape for "one imperative call, reachable from anywhere in the app" is a module-level
// mutable reference to whichever host is mounted. ADR-15 forbids exactly that, on real evidence
// (`react/context.ts`'s own header): a Next.js server process shares a module across every request, so
// module state that looks per-user is actually shared between users. This host is reached the same way
// `useRouter`/`useTheme`/`useStore` already are — a React Context, read through a hook the generator
// hoists to the top of whichever component's own render body reaches a recognized `showSnackBar`-family
// call (the same rules-of-hooks reason `component.ts`'s own `routerLocal` is hoisted, not read at the
// call site directly).
//
// ## Why one host, not one per component
//
// ADR-0030 §10 authorizes root-messenger-only support: under default Flutter configuration there is
// exactly one `ScaffoldMessenger` for the whole app (verified directly, real `flutter_test` widget
// tests). `SnackbarHostProvider` is declared once, at the application shell (`providers.tsx`), the same
// place `RouterProvider`/`ThemeProvider` already are — never per-component, unlike `DialogHost`.
//
// ## Queue semantics, and what is not attempted here
//
// A real FIFO queue, one snack bar visible at a time (ADR-0030 §3.2, §10) — a plain array in this
// provider's own state, advanced by a `setTimeout` keyed to the presented item's own duration.
// `hideCurrentSnackBar`/`removeCurrentSnackBar` both advance the queue immediately: Flutter's own
// distinction between them is an *animation* (an eased exit vs. an instant one), and — the same "structural
// capability, not pixel fidelity" boundary `dialog.ts`'s own `AlertDialog` states for M3 dialog styling —
// this milestone does not attempt the exit transition either shows. `SnackbarView` below is deliberately
// plain, for the same reason `AlertDialog`'s own styling is: it ships the structural capability the ADR
// authorizes, not a pixel-faithful Material snack bar.

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { RuntimeDiagnosticCode, RuntimeError } from '../diagnostics/codes.js';
import { useThemeSurface } from '../react/theme.js';
import type { Duration } from './animation.js';

/** A `SnackBarAction` (ADR-0030 §11) — `label`/`onPressed` only; every other property is refused at build time. */
export interface SnackbarAction {
  /** The action button's own text. */
  readonly label: string;
  /**
   * Runs when the action is pressed. Flutter auto-dismisses the snack bar immediately afterward
   * (verified directly, ADR-0030 §3.4) — this host does the same, unconditionally; nothing here needs
   * the callback to call anything to dismiss its own presentation, unlike a dialog's own action.
   */
  readonly onPress: () => void;
}

/** What one call to {@link SnackbarHostHandle.show} presents. */
export interface ShowSnackbarOptions {
  /** The action button, if the call named one. */
  readonly action?: SnackbarAction;
  /** How long to show it. Absent uses Flutter's own default (ADR-0030 §9). */
  readonly duration?: Duration;
}

/** The imperative surface a recognized `showSnackBar`-family call lowers to. */
export interface SnackbarHostHandle {
  /** `ScaffoldMessenger.of(context).showSnackBar(SnackBar(...))` — enqueues [content]. */
  show(content: ReactNode, options?: ShowSnackbarOptions): void;
  /** `hideCurrentSnackBar()` — advances the queue. */
  hide(): void;
  /** `removeCurrentSnackBar()` — advances the queue. */
  remove(): void;
  /** `clearSnackBars()` — drops the current presentation and the whole queue. */
  clear(): void;
}

/** Flutter's own default (`_snackBarDisplayDuration`), verified directly (ADR-0030 §3.5, §9). */
const DEFAULT_DURATION_MS = 4000;

const SnackbarHostContext = createContext<SnackbarHostHandle | null>(null);

interface QueuedSnackbar {
  readonly key: number;
  readonly content: ReactNode;
  readonly action?: SnackbarAction;
  readonly durationMs: number;
}

/** Props for {@link SnackbarHostProvider}. */
export interface SnackbarHostProviderProps {
  /** The subtree that can present a snack bar. */
  readonly children?: ReactNode;
}

/**
 * Owns the snack bar queue for the whole subtree, and renders whichever presentation is current.
 *
 * Declared once, at the application shell (ADR-0030 §10) — never per component, and never nested: a
 * nested `ScaffoldMessenger` is a distinct Flutter scope this milestone does not model (ADR-0030 §12),
 * and the generator refuses every recognized call in a program that constructs one, rather than
 * rendering a second one of these.
 *
 * @param props - see {@link SnackbarHostProviderProps}.
 * @returns the subtree, with the host in scope, plus the current presentation (if any) as a sibling.
 */
export function SnackbarHostProvider(props: SnackbarHostProviderProps): ReactElement {
  const [queue, setQueue] = useState<readonly QueuedSnackbar[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextKey = useRef(0);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // FIFO: whatever finished, drop the front and let the effect below arm a fresh timer for the next one
  // (or arm none, if the queue is now empty). One function for `hideCurrentSnackBar`, `removeCurrentSnackBar`
  // and the duration timer's own expiry, all three of which mean the same thing at this structural level.
  const advance = useCallback(() => {
    setQueue((current) => current.slice(1));
  }, []);

  // Arms a fresh timer whenever the item at the front of the queue changes — including the first time one
  // appears, and every time `advance` removes one and a next item takes its place.
  useEffect(() => {
    clearTimer();
    if (queue.length === 0) return undefined;
    const durationMs = queue[0]!.durationMs;
    timer.current = setTimeout(advance, durationMs);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `clearTimer`/`advance` are stable (useCallback, empty deps)
  }, [queue]);

  const handle = useMemo<SnackbarHostHandle>(
    () => ({
      show: (content, options) => {
        const key = nextKey.current;
        nextKey.current += 1;
        const durationMs = options?.duration?.inMilliseconds ?? DEFAULT_DURATION_MS;
        setQueue((current) => [
          ...current,
          { key, content, durationMs, ...(options?.action === undefined ? {} : { action: options.action }) },
        ]);
      },
      hide: () => {
        clearTimer();
        advance();
      },
      remove: () => {
        clearTimer();
        advance();
      },
      clear: () => {
        clearTimer();
        setQueue([]);
      },
    }),
    [advance, clearTimer],
  );

  const current = queue[0];

  return createElement(
    SnackbarHostContext.Provider,
    { value: handle },
    props.children,
    current === undefined
      ? null
      : createElement(SnackbarView, {
          key: current.key,
          content: current.content,
          ...(current.action === undefined ? {} : { action: current.action }),
          onAction: () => {
            current.action?.onPress();
            clearTimer();
            advance();
          },
        }),
  );
}

/**
 * Reads the snack bar host provided by an enclosing {@link SnackbarHostProvider}.
 *
 * Hoisted to a component's own render body by the generator (`component.ts`'s `declareSnackbarHost`),
 * the same rules-of-hooks reason `useRouter()` is (ADR-0030) — a recognized `showSnackBar`-family call is
 * almost always inside a callback, and a hook cannot be called there.
 *
 * @returns the host.
 * @throws RuntimeError - `BRG4005` if there is no enclosing `SnackbarHostProvider`. Never observed from
 * generated output: the generator only ever hoists this hook in a component reachable from a program
 * that also emits the provider (`providers.tsx`), so the two are always present together.
 */
export function useSnackbarHost(): SnackbarHostHandle {
  const host = useContext(SnackbarHostContext);
  if (host === null) {
    throw new RuntimeError(
      RuntimeDiagnosticCode.MissingProvider,
      "the snack bar host was read outside a <SnackbarHostProvider>. State is provider-scoped, never a " +
        'module singleton (ADR-15), so there is no ambient instance to fall back to',
      ['SnackbarHostProvider'],
    );
  }
  return host;
}

interface SnackbarViewProps {
  readonly content: ReactNode;
  readonly action?: SnackbarAction;
  readonly onAction: () => void;
}

/**
 * The current presentation's own surface.
 *
 * Deliberately plain (see this file's own header) — a fixed, centered bar at the bottom of the viewport,
 * `role="status"` so assistive technology announces it the way Flutter's own semantics do, with no entry/exit
 * transition and no M3 elevation/surface-tint treatment.
 */
function SnackbarView(props: SnackbarViewProps): ReactElement {
  const theme = useThemeSurface();
  return createElement(
    'div',
    {
      role: 'status',
      style: {
        position: 'fixed',
        insetInlineStart: '50%',
        transform: 'translateX(-50%)',
        bottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        maxWidth: 'min(560px, calc(100vw - 32px))',
        padding: '14px 16px',
        borderRadius: 4,
        boxSizing: 'border-box',
        backgroundColor: theme.color('inverseSurface'),
        color: theme.color('onInverseSurface'),
        zIndex: 1000,
      },
    },
    createElement('div', { style: { flex: '1 1 auto', minWidth: 0 } }, props.content),
    props.action === undefined
      ? null
      : createElement(
          'button',
          {
            type: 'button',
            onClick: props.onAction,
            style: {
              flexShrink: 0,
              border: 'none',
              background: 'transparent',
              color: theme.color('inversePrimary'),
              font: 'inherit',
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
            },
          },
          props.action.label,
        ),
  );
}
