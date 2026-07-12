// M0-T4 SPIKE — hand-rolled kit, layout engine (CSS tier).
//
// Four of the ten components. These implement Flutter's layout protocol on flexbox, which is the
// whole thesis of ADR-6: the sharp edges live here, once, not in every generated file.
//
// This is NOT @bridge/runtime-react. That package is built at M2-T12..T15, against its own visual
// suite. This is a hand-rolled stand-in whose only job is to let the reference login screen render.

import type { CSSProperties, ReactNode } from 'react';

export type MainAxisAlignment =
  | 'start'
  | 'center'
  | 'end'
  | 'spaceBetween'
  | 'spaceAround'
  | 'spaceEvenly';

export type CrossAxisAlignment = 'start' | 'center' | 'end' | 'stretch';

/** Flutter EdgeInsets: a scalar (`EdgeInsets.all`) or per-side (`EdgeInsets.only/symmetric`). */
export type EdgeInsets =
  | number
  | { top?: number; right?: number; bottom?: number; left?: number };

const MAIN_AXIS: Record<MainAxisAlignment, CSSProperties['justifyContent']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  spaceBetween: 'space-between',
  spaceAround: 'space-around',
  spaceEvenly: 'space-evenly',
};

const CROSS_AXIS: Record<CrossAxisAlignment, CSSProperties['alignItems']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};

function toPadding(padding: EdgeInsets): string {
  if (typeof padding === 'number') return `${padding}px`;
  const { top = 0, right = 0, bottom = 0, left = 0 } = padding;
  return `${top}px ${right}px ${bottom}px ${left}px`;
}

export function Column({
  mainAxisAlignment = 'start',
  crossAxisAlignment = 'center',
  children,
}: {
  mainAxisAlignment?: MainAxisAlignment;
  crossAxisAlignment?: CrossAxisAlignment;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: MAIN_AXIS[mainAxisAlignment],
        alignItems: CROSS_AXIS[crossAxisAlignment],
      }}
    >
      {children}
    </div>
  );
}

/**
 * SHARP EDGE (finding F-layout-1, see README §Findings).
 *
 * Flutter's Center passes *loose* constraints down: the child may take up to the parent's width and
 * decides for itself. A `Column(crossAxisAlignment: stretch)` therefore fills the width, while a
 * bare `Text` shrink-wraps. CSS has no equivalent: a flex child shrink-wraps, full stop.
 *
 * The CSS tier cannot express both behaviours from one rule. This implementation stretches the child
 * (`alignItems: 'stretch'`), which is correct for the stretch-y children the login screen has and
 * WRONG for a shrink-wrapping child such as `Center(child: Text(...))`.
 *
 * Not a bug to paper over in generated code — it is exactly the case the frozen spec's
 * `layout-boundedness` analysis exists to detect, so that M2-T12 can pick the CSS tier or the
 * measured tier per subtree. Recorded, not resolved.
 */
export function Center({ children }: { children?: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'stretch',
        flex: 1,
        width: '100%',
        minHeight: 0,
      }}
    >
      {children}
    </div>
  );
}

export function Padding({ padding, children }: { padding: EdgeInsets; children?: ReactNode }) {
  return <div style={{ padding: toPadding(padding) }}>{children}</div>;
}

/**
 * Flutter's SizedBox imposes a *tight* constraint. With a child it is a sized box; without one it is
 * a spacer. `flexShrink: 0` is the sharp edge: a bare SizedBox inside a flex Column would otherwise
 * be compressed to nothing, and the gap the Flutter layout depends on would silently vanish.
 */
export function SizedBox({
  width,
  height,
  children,
}: {
  width?: number;
  height?: number;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        ...(width !== undefined ? { width: `${width}px` } : {}),
        ...(height !== undefined ? { height: `${height}px` } : {}),
        flexShrink: 0,
      }}
    >
      {children}
    </div>
  );
}
