// @vitest-environment jsdom

import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Checkbox,
  FocusNode,
  Form,
  InputDecoration,
  Radio,
  Slider,
  Switch,
  TextEditingController,
  TextField,
  TextFormField,
  ThemeProvider,
  type ThemeDescriptor,
} from '../src/index.js';

// Forms and text input (M4-F).
//
// The controller model is the interesting part and the reason these tests exist: a `TextEditingController` is
// a signal, so a field subscribed to one re-renders when anything writes it — including code that is nowhere
// near the field. That is Flutter's contract and it is what the first two tests pin.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

function render(element: ReactElement): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  mounted.push({ root, container });
  return container;
}

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

const theme: ThemeDescriptor = {
  tokens: [
    ['primary', '#FF6750A4'],
    ['onPrimary', '#FFFFFFFF'],
    ['onSurface', '#FF1D1B20'],
    ['onSurfaceVariant', '#FF49454F'],
    ['error', '#FFB3261E'],
    ['outline', '#FF79747E'],
    ['surfaceContainerHighest', '#FFE6E0E9'],
  ].map(([name, light]) => ({ name: name!, group: 'color' as const, role: name!, light: light! })),
};

function app(element: ReactElement): HTMLElement {
  return render(createElement(ThemeProvider, { descriptor: theme }, element));
}

/**
 * Types into a field the way a user does.
 *
 * React tracks a controlled input's value on the DOM node itself and skips `onChange` when the value it sees
 * has not moved — so assigning `input.value` directly and dispatching `input` fires nothing. Going through
 * the *native* setter is what a real keystroke does, and is the only way to exercise the controlled path
 * rather than a simulation of it.
 */
function type(container: HTMLElement, text: string): void {
  const element = field(container);
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(prototype.prototype, 'value')?.set;
  act(() => {
    setter?.call(element, text);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** The `<input>` or `<textarea>` a field rendered. */
function field(container: HTMLElement): HTMLInputElement | HTMLTextAreaElement {
  const element = container.querySelector('input, textarea');
  if (element === null) throw new Error('no field rendered');
  return element as HTMLInputElement | HTMLTextAreaElement;
}

describe('TextEditingController is state, not a listener list', () => {
  it('a field shows its controller’s text', () => {
    const controller = new TextEditingController({ text: 'hello' });
    expect(field(app(createElement(TextField, { controller }))).value).toBe('hello');
  });

  it('writing the controller re-renders the field — the signal *is* the notification (ADR-4)', () => {
    const controller = new TextEditingController();
    const container = app(createElement(TextField, { controller }));
    act(() => {
      controller.text = 'set from outside';
    });
    expect(field(container).value).toBe('set from outside');
  });

  it('typing writes the controller before onChanged runs', () => {
    // Flutter guarantees the controller has already notified by the time `onChanged` fires, so a callback
    // that reads the controller sees the new text. This asserts the same ordering.
    const controller = new TextEditingController();
    const seen: string[] = [];
    const container = app(
      createElement(TextField, { controller, onChanged: () => seen.push(controller.text) }),
    );
    type(container, 'abc');
    expect(seen).toEqual(['abc']);
    expect(controller.text).toBe('abc');
  });

  it('clear empties the field', () => {
    const controller = new TextEditingController({ text: 'x' });
    const container = app(createElement(TextField, { controller }));
    act(() => controller.clear());
    expect(field(container).value).toBe('');
  });

  it('a field with no controller still keeps its own text, as an uncontrolled Flutter field does', () => {
    const container = app(createElement(TextField, {}));
    type(container, 'typed');
    expect(field(container).value).toBe('typed');
  });

  it('dispose is safe to call, because the generated code always calls it', () => {
    const controller = new TextEditingController();
    expect(() => controller.dispose()).not.toThrow();
  });
});

describe('the field maps Flutter’s options onto the platform', () => {
  it('obscureText is a password field, whatever keyboard was asked for', () => {
    const input = field(app(createElement(TextField, { obscureText: true, keyboardType: 'emailAddress' })));
    expect(input.getAttribute('type')).toBe('password');
  });

  it('keyboardType sets both the type and the inputmode', () => {
    // Two attributes because they answer different questions: `type` decides validation, `inputmode` decides
    // which on-screen keyboard a phone shows.
    const input = field(app(createElement(TextField, { keyboardType: 'emailAddress' })));
    expect(input.getAttribute('type')).toBe('email');
    expect(input.getAttribute('inputmode')).toBe('email');
  });

  it('number asks for a numeric keyboard without becoming type=number', () => {
    // `type="number"` adds spinners and discards a half-typed value; Flutter does neither.
    const input = field(app(createElement(TextField, { keyboardType: 'number' })));
    expect(input.getAttribute('type')).toBe('text');
    expect(input.getAttribute('inputmode')).toBe('numeric');
  });

  it('maxLines above one is a textarea', () => {
    expect(field(app(createElement(TextField, { maxLines: 4 }))).tagName).toBe('TEXTAREA');
    expect(field(app(createElement(TextField, { maxLines: 1 }))).tagName).toBe('INPUT');
  });

  it('enabled: false disables, and readOnly shows without accepting edits', () => {
    const disabled = field(app(createElement(TextField, { enabled: false })));
    expect((disabled as HTMLInputElement).disabled).toBe(true);
    const readOnly = field(app(createElement(TextField, { readOnly: true })));
    expect((readOnly as HTMLInputElement).readOnly).toBe(true);
  });

  it('the hint is the placeholder', () => {
    const input = field(app(createElement(TextField, { decoration: { hintText: 'you@example.com' } })));
    expect(input.getAttribute('placeholder')).toBe('you@example.com');
  });

  it('a label and an error are rendered by the decorator', () => {
    const container = app(
      createElement(TextField, { decoration: new InputDecoration({ labelText: 'Email', errorText: 'bad' }) }),
    );
    expect(container.textContent).toContain('Email');
    expect(container.textContent).toContain('bad');
  });

  it('onSubmitted fires on Enter, with the current text', () => {
    const controller = new TextEditingController({ text: 'query' });
    const onSubmitted = vi.fn();
    const container = app(createElement(TextField, { controller, onSubmitted }));
    act(() => {
      field(container).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onSubmitted).toHaveBeenCalledWith('query');
  });
});

describe('FocusNode', () => {
  it('requests focus on the field it is attached to', () => {
    const node = new FocusNode();
    const container = app(createElement(TextField, { focusNode: node }));
    act(() => node.requestFocus());
    expect(document.activeElement).toBe(field(container));
  });

  it('an unattached node requests focus on nothing rather than throwing', () => {
    // An unattached node is an ordinary intermediate state during mount, not a defect.
    expect(() => new FocusNode().requestFocus()).not.toThrow();
  });
});

describe('TextFormField validation', () => {
  it('validates on edit and shows the message', () => {
    const container = app(
      createElement(TextFormField, {
        validator: (value) => (value === undefined || value.length < 3 ? 'too short' : null),
      }),
    );
    type(container, 'ab');
    expect(container.textContent).toContain('too short');
  });

  it('clears the message when the value becomes valid', () => {
    const container = app(
      createElement(TextFormField, { validator: (value) => ((value ?? '').length < 3 ? 'too short' : null) }),
    );
    type(container, 'ab');
    expect(container.textContent).toContain('too short');
    type(container, 'abcd');
    expect(container.textContent).not.toContain('too short');
  });

  it('initialValue seeds the field', () => {
    expect(field(app(createElement(TextFormField, { initialValue: 'seed' }))).value).toBe('seed');
  });

  it('a form validates every field on submit and calls onSubmit only if all pass', () => {
    const onSubmit = vi.fn();
    const container = app(
      createElement(Form, {
        onSubmit,
        child: createElement(TextFormField, { validator: (v) => ((v ?? '') === '' ? 'required' : null) }),
      }),
    );
    const form = container.querySelector('form')!;
    act(() => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(container.textContent).toContain('required');

    type(container, 'ok');
    act(() => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('two forms do not share a field registry (ADR-15)', () => {
    // A module-scope registry would collect one form's fields and validate them against another's — which on
    // a server is one user's form validating against another user's. The registry is provider-scoped.
    const first = vi.fn();
    const second = vi.fn();
    const container = app(
      createElement(
        'div',
        null,
        createElement(Form, { onSubmit: first, child: createElement(TextFormField, {}) }),
        createElement(Form, {
          onSubmit: second,
          child: createElement(TextFormField, { validator: () => 'always fails' }),
        }),
      ),
    );
    const forms = container.querySelectorAll('form');
    act(() => forms[0]!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
});

describe('selection controls are controlled, and a null callback disables them', () => {
  it('Checkbox reflects its value and reports changes', () => {
    const onChanged = vi.fn();
    const container = app(createElement(Checkbox, { value: true, onChanged }));
    const input = field(container) as HTMLInputElement;
    expect(input.checked).toBe(true);
    act(() => {
      input.click();
    });
    expect(onChanged).toHaveBeenCalledWith(false);
  });

  it('a null value is indeterminate, which is not the same as unticked', () => {
    const input = field(app(createElement(Checkbox, { value: null, onChanged: vi.fn() }))) as HTMLInputElement;
    expect(input.indeterminate).toBe(true);
    expect(input.checked).toBe(false);
  });

  it('no onChanged disables — Flutter spells a disabled control that way', () => {
    for (const control of [Checkbox, Switch, Slider]) {
      const input = field(app(createElement(control as typeof Checkbox, {}))) as HTMLInputElement;
      expect(input.disabled).toBe(true);
    }
  });

  it('Switch carries the switch role for assistive technology', () => {
    const input = field(app(createElement(Switch, { value: true, onChanged: vi.fn() })));
    expect(input.getAttribute('role')).toBe('switch');
  });

  it('Radio is selected when its value equals the group’s', () => {
    const on = field(app(createElement(Radio<string>, { value: 'a', groupValue: 'a', onChanged: vi.fn() })));
    const off = field(app(createElement(Radio<string>, { value: 'b', groupValue: 'a', onChanged: vi.fn() })));
    expect((on as HTMLInputElement).checked).toBe(true);
    expect((off as HTMLInputElement).checked).toBe(false);
  });

  it('Slider divides its range into `divisions` intervals, not steps of one', () => {
    const input = field(app(createElement(Slider, { value: 5, min: 0, max: 10, divisions: 4, onChanged: vi.fn() })));
    expect(input.getAttribute('step')).toBe('2.5');
    expect(input.getAttribute('min')).toBe('0');
    expect(input.getAttribute('max')).toBe('10');
  });

  it('a continuous slider takes any value', () => {
    const input = field(app(createElement(Slider, { value: 0.5, onChanged: vi.fn() })));
    expect(input.getAttribute('step')).toBe('any');
  });
});
