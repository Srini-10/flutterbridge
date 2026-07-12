// M0-T4 SPIKE — hand-rolled kit, Material components.
//
// Six of the ten components. Every colour is a token (`var(--bridge-*)`), never a literal: the
// theme engine is data, which is what makes ThemeData -> tokens (pass N10) a lossless mapping.

import type { CSSProperties, ReactNode } from 'react';

import './kit.css';

export function Scaffold({ appBar, children }: { appBar?: ReactNode; children?: ReactNode }) {
  return (
    <div className="bridge-scaffold">
      {appBar}
      <main className="bridge-scaffold-body">{children}</main>
    </div>
  );
}

export function AppBar({ title, actions }: { title?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="bridge-appbar">
      <div className="bridge-appbar-leading" />
      <div className="bridge-appbar-title">{title}</div>
      <div className="bridge-appbar-actions">{actions}</div>
    </header>
  );
}

/** Flutter TextStyle, narrowed to what the login screen uses. */
export type TextStyle = Pick<CSSProperties, 'fontSize' | 'fontWeight' | 'color'>;

export function Text({ children, style }: { children?: ReactNode; style?: TextStyle }) {
  return (
    <span className="bridge-text" style={style}>
      {children}
    </span>
  );
}

/**
 * `InputDecoration(labelText:)` with the default underline border. `onChanged` is a Flutter-shaped
 * callback (it receives the value, not the event) — the generator must not have to know that the DOM
 * hands back an event.
 */
export function TextField({
  label,
  obscureText = false,
  onChanged,
}: {
  label?: string;
  obscureText?: boolean;
  onChanged?: (value: string) => void;
}) {
  return (
    <input
      className="bridge-textfield"
      type={obscureText ? 'password' : 'text'}
      placeholder={label}
      aria-label={label}
      onChange={(event) => onChanged?.(event.target.value)}
    />
  );
}

/** `onPressed: null` is Flutter's disabled state, so `null` must stay meaningful here. */
export function ElevatedButton({
  onPressed,
  children,
}: {
  onPressed?: (() => void) | null;
  children?: ReactNode;
}) {
  const disabled = onPressed === null || onPressed === undefined;
  return (
    <button
      className="bridge-elevated-button"
      type="button"
      disabled={disabled}
      onClick={() => onPressed?.()}
    >
      {children}
    </button>
  );
}

export function CircularProgressIndicator({ strokeWidth = 4 }: { strokeWidth?: number }) {
  return (
    <div
      className="bridge-progress"
      role="progressbar"
      style={{ borderWidth: `${strokeWidth}px` }}
    />
  );
}
