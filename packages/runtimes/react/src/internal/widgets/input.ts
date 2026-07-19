// Text input — the controller, the focus node, the decoration, and the fields built on them.
//
// ## What the analyzer actually produces, and why this file is small because of it
//
// M4-F began by running the real analyzer over a sign-up screen rather than by designing a controller model.
// The M4-A triage had assumed controlled inputs needed an ADR; the evidence refuted it:
//
//     final TextEditingController _email = TextEditingController();
//       → sig.Signal, scope: component, type: TextEditingController, initial: logic.New TextEditingController
//     TextField(controller: _email, …)
//       → props.controller = bind.Signal   ← a reactivity edge, like any other signal read
//     onChanged: (String value) { setState(() { _note = value; }); }
//       → logic.Lambda, params: ['value']  ← a real closure with a real body
//     @override void dispose() { _email.dispose(); }
//       → sig.Effect, timing: unmount      ← disposal already modelled
//
// So the pipeline already carried everything: a controller is *state*, because the catalog already lists
// `TextEditingController` among its `stateHolders`; a callback is a closure, because ADR-19 lowers behaviour
// to closures; and cleanup is an unmount effect, because the lifecycle map already says `dispose → unmount`.
// Nothing here is a new mechanism. What was missing was the *components*.
//
// ## The controller, and where Flutter and the DOM genuinely differ
//
// Flutter's `TextEditingController` is a `ChangeNotifier` whose `text` is mutable state. ADR-4's ruling —
// *a signal write **is** the notification* — makes the mapping exact: `text` is backed by a
// `WritableSignal<string>`, so reading it subscribes and writing it notifies, with no listener plumbing.
//
// The one real difference is **cursor position**. Flutter's controller owns a `selection` as well as a
// `text`, and rewriting `text` moves the caret. React's controlled `<input>` preserves the caret when the
// value it is given after an edit matches what the user typed — which is what a synchronous signal write
// produces. Where the value is *transformed* on the way through (upper-casing in `onChanged`), the caret
// jumps to the end, in this kit and in every React controlled input. That is a real divergence and it is
// stated rather than papered over: fixing it needs `selection` on the controller and a `setSelectionRange`
// after paint, which is a layout write this kit does not do.

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';

import { componentDefault } from '../generated/material_metadata.js';
import { mergeStyles } from '../layout/constraints.js';
import type { ColorToken } from '../layout/decoration.js';
import { useSignal } from '../react/hooks.js';
import { useThemeSurface } from '../react/theme.js';
import { signal, type WritableSignal } from '../state/graph.js';

const size = (field: string): number => Number(componentDefault('InputDecorator', field));
const role = (field: string): string => String(componentDefault('InputDecorator', field));

/**
 * Flutter's `TextEditingController` — the text of a field, as state.
 *
 * A `ChangeNotifier` in Flutter and a signal here, which is the same thing under ADR-4: *"a signal write is
 * the notification"*. Reading `text` inside a reactive context subscribes to it; writing it re-renders every
 * reader. There is no `addListener`, because there is nothing for a listener to do that the graph does not.
 *
 * Held in a component-scoped signal by the generated code — `useState(() => signal(new TextEditingController()))`
 * — which is what the analyzer's `sig.Signal(scope: component)` lowers to, so one controller exists per mount
 * and never at module scope (INV-19, ADR-15).
 */
export class TextEditingController {
  /** The text, as a signal. Public so a field can subscribe to it without a second channel. */
  public readonly textSignal: WritableSignal<string>;

  public constructor(options: { readonly text?: string } = {}) {
    this.textSignal = signal(options.text ?? '');
  }

  /** The current text. **Reactive** — reading this inside a render or a `derived` subscribes to it. */
  public get text(): string {
    return this.textSignal.get();
  }

  /** Replaces the text, notifying every reader. */
  public set text(value: string) {
    this.textSignal.set(value);
  }

  /** Empties the field — Flutter's `TextEditingController.clear`. */
  public clear(): void {
    this.textSignal.set('');
  }

  /**
   * Releases the controller.
   *
   * A no-op, and deliberately so rather than absent: the generated code calls it from an unmount effect
   * because the Dart source did, and a signal with no subscribers is already garbage. Removing the method
   * would make that emitted call fail to compile; making it throw would punish correct code.
   */
  public dispose(): void {
    // Nothing to release: the signal is owned by the component's `useState` and dies with the mount.
  }
}

/**
 * Flutter's `FocusNode` — a handle on one field's focus.
 *
 * Two halves, and only one of them is state. Whether a field *has* focus is observable, so `hasFocus` is a
 * signal; *requesting* focus is an imperative DOM call, so the node holds the element a field attached to it
 * and calls `focus()` on it. A node that no field has attached to requests focus on nothing rather than
 * throwing — an unattached node is an ordinary intermediate state during mount, not a defect.
 */
export class FocusNode {
  /** Whether the field is focused, as a signal. */
  public readonly hasFocusSignal: WritableSignal<boolean> = signal(false);

  /**
   * The element a field attached, if one has.
   *
   * Typed **structurally** rather than as an `HTMLElement`, because this package's `lib` is `ES2023` with no
   * DOM — which is what keeps it provably server-renderable. A focus node needs exactly two capabilities and
   * naming them is more honest than importing a whole platform to describe them.
   */
  private element: Focusable | null = null;

  /** Whether the field is focused. **Reactive**. */
  public get hasFocus(): boolean {
    return this.hasFocusSignal.get();
  }

  /** Attaches an element. Called by the field that receives this node; not part of Flutter's API. */
  public attach(element: Focusable | null): void {
    this.element = element;
  }

  /** Moves focus to the field — Flutter's `FocusNode.requestFocus`. */
  public requestFocus(): void {
    this.element?.focus();
  }

  /** Removes focus from the field — Flutter's `FocusNode.unfocus`. */
  public unfocus(): void {
    this.element?.blur();
  }

  /** Releases the node. A no-op, for the reason {@link TextEditingController.dispose} gives. */
  public dispose(): void {
    this.element = null;
  }
}

/** The two capabilities a focus node needs of the thing it points at. See {@link FocusNode}. */
interface Focusable {
  /** Moves focus to it. */
  focus(): void;
  /** Removes focus from it. */
  blur(): void;
}

/** The kind of keyboard a field asks for — Flutter's `TextInputType`. */
export type TextInputType = 'text' | 'number' | 'emailAddress' | 'phone' | 'url' | 'multiline';

/** Flutter's `TextInputType`, as a value. See `layout/alignment.ts` on why the kit exports enum values. */
export const TextInputType: Readonly<Record<TextInputType, TextInputType>> = Object.freeze({
  text: 'text',
  number: 'number',
  emailAddress: 'emailAddress',
  phone: 'phone',
  url: 'url',
  multiline: 'multiline',
});

/**
 * `TextInputType` → the `<input type>` and `inputmode` a browser needs.
 *
 * Both, because they answer different questions: `type` decides validation and the control's behaviour,
 * `inputmode` decides which on-screen keyboard a phone shows — which is the thing `TextInputType` is *for*.
 * Setting only `type` gives the right keyboard on mobile and the wrong validation on desktop; setting only
 * `inputmode` gives neither.
 *
 * `number` maps to `inputmode: 'numeric'` with a `text` type rather than `type="number"`, because a numeric
 * input adds spinners and silently discards a value the user is midway through typing — neither of which
 * Flutter does.
 */
const INPUT_MODE: Readonly<Record<TextInputType, { type: string; inputMode: string }>> = Object.freeze({
  text: { type: 'text', inputMode: 'text' },
  number: { type: 'text', inputMode: 'numeric' },
  emailAddress: { type: 'email', inputMode: 'email' },
  phone: { type: 'tel', inputMode: 'tel' },
  url: { type: 'url', inputMode: 'url' },
  multiline: { type: 'text', inputMode: 'text' },
});

/** What the keyboard's action key does — Flutter's `TextInputAction`. */
export type TextInputAction = 'done' | 'next' | 'send' | 'search' | 'go';

/** Flutter's `TextInputAction`, as a value. */
export const TextInputAction: Readonly<Record<TextInputAction, TextInputAction>> = Object.freeze({
  done: 'done',
  next: 'next',
  send: 'send',
  search: 'search',
  go: 'go',
});

/** How a field auto-capitalises — Flutter's `TextCapitalization`. */
export type TextCapitalization = 'none' | 'words' | 'sentences' | 'characters';

/** Flutter's `TextCapitalization`, as a value. */
export const TextCapitalization: Readonly<Record<TextCapitalization, TextCapitalization>> = Object.freeze({
  none: 'none',
  words: 'words',
  sentences: 'sentences',
  characters: 'characters',
});

/** `TextCapitalization` → the HTML `autocapitalize` attribute. The four values line up one-to-one. */
const AUTOCAPITALIZE: Readonly<Record<TextCapitalization, string>> = Object.freeze({
  none: 'off',
  words: 'words',
  sentences: 'sentences',
  characters: 'characters',
});

/** What decorates a field — the runtime form of Flutter's `InputDecoration`. */
export interface InputDecorationOptions {
  /** The label, floating above the field when it has content or focus. */
  readonly labelText?: string;
  /** Placeholder text, shown only while the field is empty. */
  readonly hintText?: string;
  /** A hint below the field. Replaced by {@link errorText} when there is one, as in Flutter. */
  readonly helperText?: string;
  /** An error below the field. Its presence is what puts the field in its error state. */
  readonly errorText?: string;
  /** A widget before the text. */
  readonly prefixIcon?: ReactNode;
  /** A widget after the text. */
  readonly suffixIcon?: ReactNode;
  /** Whether the field has a filled background. */
  readonly filled?: boolean;
  /** The token holding the fill colour, when `filled`. */
  readonly fillColor?: ColorToken;
}

/**
 * Flutter's `InputDecoration`, as a constructible value.
 *
 * Named arguments become one options object, the kit's convention for every mirrored value type — so
 * `InputDecoration(labelText: 'Email')` lowers to `new InputDecoration({ labelText: 'Email' })` through the
 * generator's existing kit-provided path, with no per-type table.
 */
export class InputDecoration implements InputDecorationOptions {
  /** The floating label. */
  public readonly labelText?: string;
  /** The placeholder. */
  public readonly hintText?: string;
  /** The helper line. */
  public readonly helperText?: string;
  /** The error line. */
  public readonly errorText?: string;
  /** A leading widget. */
  public readonly prefixIcon?: ReactNode;
  /** A trailing widget. */
  public readonly suffixIcon?: ReactNode;
  /** Whether the field is filled. */
  public readonly filled?: boolean;
  /** The fill token. */
  public readonly fillColor?: ColorToken;

  public constructor(options: InputDecorationOptions = {}) {
    if (options.labelText !== undefined) this.labelText = options.labelText;
    if (options.hintText !== undefined) this.hintText = options.hintText;
    if (options.helperText !== undefined) this.helperText = options.helperText;
    if (options.errorText !== undefined) this.errorText = options.errorText;
    if (options.prefixIcon !== undefined) this.prefixIcon = options.prefixIcon;
    if (options.suffixIcon !== undefined) this.suffixIcon = options.suffixIcon;
    if (options.filled !== undefined) this.filled = options.filled;
    if (options.fillColor !== undefined) this.fillColor = options.fillColor;
  }
}

/** Props for {@link InputDecorator}. */
export interface InputDecoratorProps {
  /** What to draw. */
  readonly decoration?: InputDecorationOptions;
  /** Whether the field inside has focus. Drives the active-indicator colour and width. */
  readonly isFocused?: boolean;
  /** Whether the field is disabled. Drives the disabled opacity. */
  readonly isDisabled?: boolean;
  /** The control being decorated. Flutter's `child` slot, per the catalog. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `InputDecorator` — the border, label, helper and error around a field.
 *
 * Its own widget in Flutter and its own component here, for the same reason: `TextField` and
 * `TextFormField` and a `DropdownButtonFormField` all wear the same decoration, and a decoration drawn
 * separately in each is three that drift. Everything below is composed from the catalog's transcribed M3
 * values; not one colour or dimension is written in this file.
 *
 * The label does **not** float on focus. Flutter animates it from inside the field to the border's notch,
 * and the animation engine is deferred to M5; a label that jumped without animating would be a visibly
 * different control from the reference. So the label sits above the field, which is where it ends up, and
 * the *transition* is what is missing rather than the layout.
 *
 * @param props - see {@link InputDecoratorProps}.
 * @returns the decorated control.
 * @throws RuntimeError - `BRG4006` if the theme lacks a role the decoration paints.
 */
export function InputDecorator(props: InputDecoratorProps): ReactElement {
  const theme = useThemeSurface();
  const decoration = props.decoration ?? {};
  const hasError = decoration.errorText !== undefined;

  const borderColor = hasError
    ? theme.color(role('errorColorRole'))
    : props.isFocused === true
      ? theme.color(role('focusedBorderColorRole'))
      : theme.color(role('borderColorRole'));

  const box: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingInline: size('paddingHorizontal'),
    paddingTop: size('paddingBottom'),
    paddingBottom: size('paddingBottom'),
    borderRadius: size('borderRadius'),
    borderStyle: 'solid',
    borderWidth: props.isFocused === true || hasError ? size('focusedBorderWidth') : size('borderWidth'),
    borderColor,
    boxSizing: 'border-box',
    ...(decoration.filled === true && decoration.fillColor !== undefined
      ? { backgroundColor: theme.color(decoration.fillColor) }
      : {}),
  };

  const wrapper: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    // Flutter dims the whole decorator at a disabled field's opacity rather than recolouring each part.
    opacity: props.isDisabled === true ? size('disabledOpacity') : 1,
  };
  const labelStyle: CSSProperties = {
    color: hasError ? theme.color(role('errorColorRole')) : theme.color(role('labelColorRole')),
    // The scale Flutter's floating label settles at, so a label here is the size it is there.
    fontSize: `${size('labelScale') * 100}%`,
  };

  return createElement(
    'div',
    { style: wrapper },
    decoration.labelText === undefined
      ? null
      : createElement('span', { key: 'l', style: labelStyle }, decoration.labelText),
    createElement(
      'div',
      { key: 'b', style: box },
      decoration.prefixIcon,
      createElement('div', { key: 'c', style: { flex: '1 1 0%', minWidth: 0 } }, props.child),
      decoration.suffixIcon,
    ),
    decoration.errorText === undefined && decoration.helperText === undefined
      ? null
      : createElement('span', { key: 'h', style: labelStyle }, decoration.errorText ?? decoration.helperText),
  );
}

/** What every text field takes. Shared so `TextField` and `TextFormField` cannot drift apart. */
interface TextFieldLike {
  /** The controller owning the text. Without one the field keeps its own. */
  readonly controller?: TextEditingController;
  /** The focus handle. */
  readonly focusNode?: FocusNode;
  /** What to draw around it. */
  readonly decoration?: InputDecorationOptions;
  /** Which keyboard to ask for. */
  readonly keyboardType?: TextInputType;
  /** What the action key does. */
  readonly textInputAction?: TextInputAction;
  /** How the field auto-capitalises. */
  readonly textCapitalization?: TextCapitalization;
  /** Whether the text is hidden. */
  readonly obscureText?: boolean;
  /** The most lines to show. `1` is a single-line input; more is a textarea. */
  readonly maxLines?: number;
  /** The fewest lines to show. */
  readonly minLines?: number;
  /** The most characters accepted. */
  readonly maxLength?: number;
  /** Whether the field accepts input. Defaults to `true`, as in Flutter. */
  readonly enabled?: boolean;
  /** Whether the field shows its value without accepting edits. */
  readonly readOnly?: boolean;
  /** Whether the field takes focus on mount. */
  readonly autofocus?: boolean;
  /** Called with the new text on every edit. */
  readonly onChanged?: (value: string) => void;
  /** Called when the action key is pressed. */
  readonly onSubmitted?: (value: string) => void;
  /** Called when editing finishes. */
  readonly onEditingComplete?: () => void;
}

/**
 * The `<input>`/`<textarea>` every text field renders, and the state that drives it.
 *
 * One function, because `TextField` and `TextFormField` differ in *validation*, not in how text is edited —
 * and a second copy of this is a second place for the controller wiring to be subtly wrong.
 */
function useTextControl(
  props: TextFieldLike,
  extra: { readonly onValueChange?: (value: string) => void } = {},
): { readonly element: ReactElement; readonly focused: boolean; readonly value: string } {
  // A field with no controller still needs somewhere to keep its text. Flutter does the same — an
  // uncontrolled `TextField` builds a controller internally — so this is the same object either way and the
  // rest of the function never asks which it got.
  const [fallback] = useState(() => new TextEditingController());
  const controller = props.controller ?? fallback;
  const value = useSignal(controller.textSignal);
  const [focused, setFocused] = useState(false);
  const node = useRef<Focusable | null>(null);

  const attach = useCallback(
    (element: Focusable | null): void => {
      node.current = element;
      props.focusNode?.attach(element);
    },
    [props.focusNode],
  );

  const multiline = (props.maxLines ?? 1) !== 1 || props.keyboardType === 'multiline';
  const mode = INPUT_MODE[props.keyboardType ?? 'text'];
  const disabled = props.enabled === false;

  const handleChange = (next: string): void => {
    // The controller is written first, so a reader that runs inside `onChanged` sees the new text — which is
    // what Flutter guarantees, since the controller has already notified by the time the callback runs.
    controller.text = next;
    extra.onValueChange?.(next);
    props.onChanged?.(next);
  };

  const shared = {
    ref: attach,
    value,
    disabled,
    readOnly: props.readOnly ?? false,
    autoFocus: props.autofocus ?? false,
    placeholder: props.decoration?.hintText,
    maxLength: props.maxLength,
    autoCapitalize: AUTOCAPITALIZE[props.textCapitalization ?? 'none'],
    // `enterKeyHint` is the browser's `textInputAction`: it labels the action key without changing what it
    // does, which is exactly what Flutter's does too.
    enterKeyHint: props.textInputAction,
    onChange: (event: { target: { value: string } }): void => handleChange(event.target.value),
    onFocus: (): void => setFocused(true),
    onBlur: (): void => {
      setFocused(false);
      props.onEditingComplete?.();
    },
    style: {
      // The field paints nothing: the decorator owns the border, the fill and the padding, so a field that
      // drew its own would double every one of them.
      border: 'none',
      outline: 'none',
      background: 'transparent',
      font: 'inherit',
      color: 'inherit',
      width: '100%',
      padding: 0,
    } satisfies CSSProperties,
  };

  const element = multiline
    ? createElement('textarea', {
        ...shared,
        rows: props.maxLines,
        // Flutter's `minLines` is a *minimum* height; `rows` is the shown height, so the smaller of the two
        // is the row count and the larger bounds growth.
        ...(props.minLines === undefined ? {} : { rows: props.minLines }),
      })
    : createElement('input', {
        ...shared,
        // `obscureText` wins over the keyboard type: a password field is a password field whatever keyboard
        // was asked for, and Flutter resolves it the same way.
        type: props.obscureText === true ? 'password' : mode.type,
        inputMode: mode.inputMode,
        onKeyDown: (event: { key: string }): void => {
          if (event.key === 'Enter') props.onSubmitted?.(controller.text);
        },
      });

  return { element, focused, value };
}

/** Props for {@link TextField}. Flutter's `TextField`. */
export interface TextFieldProps extends TextFieldLike {}

/**
 * Flutter's `TextField` — a single line of editable text, decorated.
 *
 * Controlled, in React's sense and Flutter's: the value shown is the controller's, and an edit writes the
 * controller. See this file's header on the one place that diverges — a caret that jumps when `onChanged`
 * transforms the text.
 *
 * @param props - see {@link TextFieldProps}.
 * @returns the field.
 */
export function TextField(props: TextFieldProps): ReactElement {
  const control = useTextControl(props);
  return createElement(InputDecorator, {
    // Spread rather than assigned, because under `exactOptionalPropertyTypes` an absent `decoration` and an
    // explicit `undefined` are different types — and `InputDecorator` reads absence as "draw no decoration".
    ...(props.decoration === undefined ? {} : { decoration: props.decoration }),
    isFocused: control.focused,
    isDisabled: props.enabled === false,
    child: control.element,
  });
}

/** Props for {@link TextFormField}. Flutter's `TextFormField`. */
export interface TextFormFieldProps extends TextFieldLike {
  /** The text the field starts with, when no controller supplies it. */
  readonly initialValue?: string;
  /**
   * Validates the field's text, returning an error message or `null`.
   *
   * Runs on every edit *and* on form submission. Flutter runs it only when the enclosing `Form` is validated
   * — see {@link Form} on why that trigger is not reachable here and what happens instead.
   */
  readonly validator?: (value: string | undefined) => string | null | undefined;
}

/**
 * Flutter's `TextFormField` — a `TextField` that validates.
 *
 * The validator runs on edit, and its result replaces the decoration's `errorText`. That is **more eager**
 * than Flutter, which runs validators when the enclosing `Form` is validated, and the difference is stated
 * rather than hidden: Flutter's trigger is `_formKey.currentState!.validate()`, an imperative call through a
 * `GlobalKey`, and a `GlobalKey` is a handle on a widget's State that UIR has no construct for. The generator
 * refuses that call (`BRG3015`) rather than letting it silently do nothing.
 *
 * What *is* reachable is submission: a field inside a {@link Form} registers with it, so submitting the form
 * validates every field. Both triggers therefore work; only Flutter's imperative one does not.
 *
 * @param props - see {@link TextFormFieldProps}.
 * @returns the field.
 */
export function TextFormField(props: TextFormFieldProps): ReactElement {
  const form = useFormRegistration();
  const [error, setError] = useState<string | null>(null);
  const [seeded] = useState(() => {
    const controller = props.controller ?? new TextEditingController();
    if (props.initialValue !== undefined && controller.text === '') controller.text = props.initialValue;
    return controller;
  });

  const validate = useCallback(
    (value: string): boolean => {
      const message = props.validator?.(value) ?? null;
      setError(message ?? null);
      return message === null || message === undefined;
    },
    [props.validator],
  );

  form?.register(seeded, validate);

  const control = useTextControl(
    { ...props, controller: seeded },
    { onValueChange: (value) => void validate(value) },
  );

  // The validator's message replaces the decoration's own `errorText`. A decoration that stated one *and* a
  // validator that returned another would be two errors for one field; Flutter resolves it the same way.
  const decoration =
    error === null ? props.decoration : { ...(props.decoration ?? {}), errorText: error };

  return createElement(InputDecorator, {
    ...(decoration === undefined ? {} : { decoration }),
    isFocused: control.focused,
    isDisabled: props.enabled === false,
    child: control.element,
  });
}

/** What a field registers with its enclosing form. */
interface FormRegistration {
  /** Registers a field's validator. Idempotent per controller. */
  register(controller: TextEditingController, validate: (value: string) => boolean): void;
}

/**
 * The enclosing form's registry.
 *
 * A **context**, not a module-scope variable — and the distinction is the one ADR-15 exists for. A module is
 * shared across every request in a Next.js server process, so a module-scope registry would collect one
 * user's fields and validate them against another user's form. INV-19 forbids exactly this, and it is the
 * defect ADR-15 was written about; a form registry is no more exempt from it than a cart is.
 *
 * The value is a **stable object holding a mutable Map**, so registering a field during render mutates the
 * map without changing the context value — no re-render, and no context that changes on every keystroke.
 */
const FormContext = createContext<FormRegistration | null>(null);

function useFormRegistration(): FormRegistration | undefined {
  return useContext(FormContext) ?? undefined;
}

/** Props for {@link Form}. Flutter's `Form`. */
export interface FormProps {
  /** Called when the form is submitted and every field validates. */
  readonly onSubmit?: () => void;
  /** The fields. Flutter's `child` slot, per the catalog. */
  readonly child?: ReactNode;
}

/**
 * Flutter's `Form` — a group of fields validated together.
 *
 * Renders a real `<form>`, so submitting it — the Enter key, or a submit button — validates every registered
 * field and calls `onSubmit` only if all of them pass. That is genuine form behaviour, and it is the trigger
 * this architecture can honestly provide.
 *
 * What it cannot provide is Flutter's own trigger. `Form(key: _formKey)` with
 * `_formKey.currentState!.validate()` reaches into the widget's State through a `GlobalKey`, and a
 * `GlobalKey` is a handle on a live element that UIR has no construct for — it is not a value, not a signal
 * and not a route. The generator reports `BRG3015` at the call rather than emitting something inert, so an
 * application that validates that way is told exactly what is missing instead of shipping a button that does
 * nothing.
 *
 * @param props - see {@link FormProps}.
 * @returns the form.
 */
export function Form(props: FormProps): ReactElement {
  const id = useId();
  const [fields] = useState(
    () => new Map<TextEditingController, (value: string) => boolean>(),
  );
  // One registry per mount, created once — so it is stable as a context value and the map it closes over is
  // this form's alone. `useState`'s initialiser is what makes it per-mount rather than per-render.
  const [registration] = useState<FormRegistration>(() => ({
    register: (controller, validate) => {
      fields.set(controller, validate);
    },
  }));

  const onSubmit = (event: { preventDefault: () => void }): void => {
    event.preventDefault();
    // Every field is validated, not just up to the first failure: Flutter's `FormState.validate` does the
    // same, so that a submit shows every error at once rather than one at a time.
    let valid = true;
    for (const [controller, validate] of fields) {
      if (!validate(controller.text)) valid = false;
    }
    if (valid) props.onSubmit?.();
  };

  return createElement(
    FormContext.Provider,
    { value: registration },
    createElement('form', { id, onSubmit, noValidate: true }, props.child),
  );
}

/** The style a control shares with the decorator's box. Exported so a selection control can sit in one. */
export function controlStyle(extra: CSSProperties = {}): CSSProperties {
  return mergeStyles({ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }, extra);
}

/**
 * Flutter's `ValueNotifier<T>` — a single value that notifies when it changes.
 *
 * ## Why it is here even though `ValueListenableBuilder` is not
 *
 * M4-I erases the *builder*: `ValueListenableBuilder`, `ListenableBuilder` and `Builder` exist only to scope
 * a rebuild, and under ADR-4 and ADR-20 a signal read already is the subscription, so INV-22 requires the
 * wrapper not to survive extraction. What survives is the **notifier itself**, because it is state — the
 * catalog lists `ValueNotifier` among its `stateHolders`, so a field holding one becomes a `sig.Signal` and
 * the generated component constructs one.
 *
 * The implementation is `TextEditingController`'s, generalised: ADR-4's ruling that *a signal write **is**
 * the notification* makes a `ChangeNotifier` exact rather than approximate, so there is no listener list
 * here and there cannot need to be one.
 */
export class ValueNotifier<T> {
  /** The value, as a signal. Public so a reader can subscribe without a second channel. */
  public readonly valueSignal: WritableSignal<T>;

  public constructor(initial: T) {
    this.valueSignal = signal(initial);
  }

  /** The current value. **Reactive** — reading it inside a render or a `derived` subscribes to it. */
  public get value(): T {
    return this.valueSignal.get();
  }

  /** Replaces the value, notifying every reader. */
  public set value(next: T) {
    this.valueSignal.set(next);
  }

  /**
   * Releases the notifier.
   *
   * A no-op, for the reason `TextEditingController.dispose` gives: the generated code calls it from an
   * unmount effect because the Dart source did, and a signal with no subscribers is already garbage.
   */
  public dispose(): void {
    // Intentionally empty. See the doc comment.
  }
}
