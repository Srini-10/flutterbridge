// GENERATED CODE — DO NOT EDIT.
//
// Generated from catalog/widgets/material.json by tools/catalog-codegen.
//
// Material's own constants, transcribed from the Flutter SDK (3.44.0) into the catalog and
// generated here. INV-20 (ADR-13) forbids a kit component holding a literal; this is where the numbers live
// instead. To change one, change the JSON — and cite the SDK line it came from, as every value there does.

/** One stop on M3's elevation → surface-tint-opacity curve. */
export interface ElevationStop {
  /** The elevation, in logical pixels. */
  readonly elevation: number;
  /** The surface tint's opacity at that elevation, 0–1. */
  readonly opacity: number;
}

/**
 * State layer opacities, by interaction.
 *
 * `dragged` is absent, and its absence is a fact rather than an omission: `WidgetState.dragged` exists in
 * Flutter, but no M3 defaults class assigns it an opacity, so the framework states no value to transcribe.
 */
export const STATE_LAYER_OPACITY: Readonly<Record<string, number>> = Object.freeze({
  "focus": 0.1,
  "hover": 0.08,
  "press": 0.1,
});

/** Disabled-state opacities, for a component's container and its content. */
export const DISABLED_OPACITY: Readonly<Record<string, number>> = Object.freeze({
  "container": 0.12,
  "content": 0.38,
});

/**
 * M3's elevation → surface-tint-opacity curve, as interpolation stops.
 *
 * Material 3 renders elevation as a *tint* rather than a shadow alone. Values between stops interpolate
 * linearly and values outside the range clamp, which is what Flutter's own
 * `ElevationOverlay._surfaceTintOpacityForElevation` does.
 */
export const ELEVATION_STOPS: readonly ElevationStop[] = Object.freeze([
  { elevation: 0.0, opacity: 0.0 },
  { elevation: 1.0, opacity: 0.05 },
  { elevation: 3.0, opacity: 0.08 },
  { elevation: 6.0, opacity: 0.11 },
  { elevation: 8.0, opacity: 0.12 },
  { elevation: 12.0, opacity: 0.14 },
]);

/** Icon geometry and the icon font's family. */
export const ICON_DEFAULTS: Readonly<Record<string, number | string>> = Object.freeze({
  "fill": 0.0,
  "fontFamily": "MaterialIcons",
  "grade": 0.0,
  "opticalSize": 48.0,
  "size": 24.0,
  "weight": 400.0,
});

/** Per-component M3 defaults. A `colorRole` names a role the theme resolves, never a literal colour. */
export const COMPONENT_DEFAULTS: Readonly<Record<string, Readonly<Record<string, number | string>>>> =
  Object.freeze({
    "AppBar": {
      "actionsIconColorRole": "onSurfaceVariant",
      "backgroundColorRole": "surface",
      "elevation": 0.0,
      "foregroundColorRole": "onSurface",
      "iconColorRole": "onSurface",
      "scrolledUnderElevation": 3.0,
      "titleSpacing": 16.0,
      "titleTypography": "titleLarge",
      "toolbarHeight": 64.0,
    },
    "Badge": {
      "backgroundColorRole": "error",
      "largeSize": 16.0,
      "padding": 4.0,
      "smallSize": 6.0,
      "textColorRole": "onError",
    },
    "BottomNavigationBar": {
      "backgroundColorRole": "surface",
      "colorRole": "onSurfaceVariant",
      "height": 56.0,
      "iconSize": 24.0,
      "labelTypography": "labelMedium",
      "selectedColorRole": "primary",
      "selectedColorRoleDark": "secondary",
    },
    "BottomSheet": {
      "backgroundColorRole": "surfaceContainerLow",
      "dragHandleColorRole": "onSurfaceVariant",
      "dragHandleHeight": 4.0,
      "dragHandleWidth": 32.0,
      "elevation": 1.0,
      "maxWidth": 640.0,
      "topRadius": 28.0,
    },
    "Card": {
      "borderRadius": 12.0,
      "colorRole": "surfaceContainerLow",
      "elevation": 1.0,
      "margin": 4.0,
    },
    "Checkbox": {
      "borderColorRole": "onSurfaceVariant",
      "borderRadius": 2.0,
      "checkColorRole": "onPrimary",
      "fillColorRole": "primary",
      "size": 18.0,
      "strokeWidth": 2.0,
    },
    "Chip": {
      "borderRadius": 8.0,
      "height": 32.0,
      "iconColorRole": "primary",
      "iconSize": 18.0,
      "labelColorRole": "onSurfaceVariant",
      "labelPadding": 8.0,
      "padding": 8.0,
      "sideColorRole": "outlineVariant",
    },
    "ChoiceChip": {
      "borderRadius": 8.0,
      "colorRole": "onSurfaceVariant",
      "labelTypography": "labelLarge",
      "selectedColorRole": "onSecondaryContainer",
      "selectedContainerColorRole": "secondaryContainer",
    },
    "CircleAvatar": {
      "backgroundColorRole": "primaryContainer",
      "foregroundColorRole": "onPrimaryContainer",
      "radius": 20.0,
    },
    "CircularProgressIndicator": {
      "colorRole": "primary",
      "size": 36.0,
      "strokeWidth": 4.0,
    },
    "Divider": {
      "colorRole": "outlineVariant",
      "space": 16.0,
      "thickness": 1.0,
    },
    "Drawer": {
      "backgroundColorRole": "surfaceContainerLow",
      "elevation": 1.0,
      "endRadius": 16.0,
      "width": 304.0,
    },
    "ExpansionTile": {
      "colorRole": "onSurface",
      "expandedIconColorRole": "primary",
      "iconColorRole": "onSurfaceVariant",
    },
    "FloatingActionButton": {
      "borderRadius": 16.0,
      "colorRole": "primaryContainer",
      "elevation": 6.0,
      "extendedHeight": 56.0,
      "extendedIconLabelSpacing": 8.0,
      "extendedPaddingEnd": 20.0,
      "extendedPaddingStart": 16.0,
      "foregroundColorRole": "onPrimaryContainer",
      "iconSize": 24.0,
      "largeBorderRadius": 28.0,
      "largeIconSize": 36.0,
      "largeSize": 96.0,
      "margin": 16.0,
      "size": 56.0,
      "smallBorderRadius": 12.0,
      "smallSize": 40.0,
    },
    "IconButton": {
      "colorRole": "onSurfaceVariant",
      "iconSize": 24.0,
      "minSize": 40.0,
      "padding": 8.0,
    },
    "InputDecorator": {
      "borderColorRole": "onSurfaceVariant",
      "borderRadius": 4.0,
      "borderWidth": 1.0,
      "disabledOpacity": 0.38,
      "errorColorRole": "error",
      "focusedBorderColorRole": "primary",
      "focusedBorderWidth": 2.0,
      "labelColorRole": "onSurfaceVariant",
      "labelScale": 0.75,
      "paddingBottom": 8.0,
      "paddingHorizontal": 12.0,
      "paddingTop": 16.0,
      "textColorRole": "onSurface",
    },
    "LinearProgressIndicator": {
      "colorRole": "primary",
      "indeterminateDurationMs": 1800.0,
      "minHeight": 4.0,
      "trackColorRole": "secondaryContainer",
    },
    "ListTile": {
      "heightOneLine": 56.0,
      "heightThreeLine": 88.0,
      "heightTwoLine": 72.0,
      "horizontalTitleGap": 16.0,
      "iconColorRole": "onSurfaceVariant",
      "minLeadingWidth": 24.0,
      "minVerticalPadding": 8.0,
      "paddingEnd": 24.0,
      "paddingStart": 16.0,
      "subtitleColorRole": "onSurfaceVariant",
      "titleColorRole": "onSurface",
    },
    "MaterialBanner": {
      "backgroundColorRole": "surfaceContainerLow",
      "colorRole": "onSurface",
      "contentTypography": "bodyMedium",
      "dividerColorRole": "outlineVariant",
      "dividerThickness": 1.0,
      "elevation": 1.0,
      "leadingPaddingEnd": 16.0,
      "paddingBottom": 4.0,
      "paddingEnd": 16.0,
      "paddingStart": 16.0,
      "paddingTop": 24.0,
    },
    "NavigationBar": {
      "backgroundColorRole": "surfaceContainer",
      "colorRole": "onSurfaceVariant",
      "elevation": 3.0,
      "height": 80.0,
      "iconSize": 24.0,
      "indicatorColorRole": "secondaryContainer",
      "indicatorHeight": 32.0,
      "indicatorWidth": 64.0,
      "labelTypography": "labelMedium",
      "selectedColorRole": "onSecondaryContainer",
    },
    "NavigationDrawer": {
      "backgroundColorRole": "surfaceContainerLow",
      "colorRole": "onSurfaceVariant",
      "elevation": 1.0,
      "iconSize": 24.0,
      "indicatorColorRole": "secondaryContainer",
      "indicatorHeight": 56.0,
      "indicatorWidth": 336.0,
      "labelTypography": "labelLarge",
      "selectedColorRole": "onSecondaryContainer",
      "tileHeight": 56.0,
    },
    "NavigationRail": {
      "backgroundColorRole": "surface",
      "colorRole": "onSurfaceVariant",
      "elevation": 0.0,
      "iconSize": 24.0,
      "indicatorColorRole": "secondaryContainer",
      "indicatorHeight": 32.0,
      "indicatorWidth": 56.0,
      "labelColorRole": "onSurface",
      "labelTypography": "labelMedium",
      "minExtendedWidth": 256.0,
      "minWidth": 80.0,
      "selectedColorRole": "onSecondaryContainer",
    },
    "Scaffold": {
      "backgroundColorRole": "surface",
    },
    "SegmentedButton": {
      "borderRadius": 20.0,
      "borderWidth": 1.0,
      "colorRole": "onSurface",
      "labelTypography": "labelLarge",
      "minHeight": 40.0,
      "outlineColorRole": "outline",
      "paddingInline": 12.0,
      "selectedColorRole": "onSecondaryContainer",
      "selectedContainerColorRole": "secondaryContainer",
    },
    "Slider": {
      "activeTrackColorRole": "primary",
      "inactiveTrackColorRole": "surfaceContainerHighest",
      "thumbColorRole": "primary",
      "thumbSize": 20.0,
      "trackHeight": 4.0,
    },
    "Switch": {
      "selectedThumbColorRole": "onPrimary",
      "selectedTrackColorRole": "primary",
      "thumbColorRole": "outline",
      "trackBorderColorRole": "outline",
      "trackColorRole": "surfaceContainerHighest",
    },
    "TabBar": {
      "colorRole": "onSurfaceVariant",
      "dividerColorRole": "outlineVariant",
      "dividerHeight": 1.0,
      "height": 46.0,
      "indicatorColorRole": "primary",
      "indicatorHeight": 3.0,
      "labelTypography": "titleSmall",
      "selectedColorRole": "primary",
      "textAndIconHeight": 72.0,
    },
    "ToggleButtons": {
      "borderRadius": 8.0,
      "borderWidth": 1.0,
      "colorRole": "onSurface",
      "minHeight": 40.0,
      "outlineColorRole": "outline",
      "selectedColorRole": "onSecondaryContainer",
      "selectedContainerColorRole": "secondaryContainer",
    },
    "Tooltip": {
      "backgroundColorRole": "inverseSurface",
      "borderRadius": 4.0,
      "height": 32.0,
      "paddingHorizontal": 16.0,
      "paddingVertical": 4.0,
      "textColorRole": "onInverseSurface",
      "verticalOffset": 24.0,
    },
  });

/**
 * The surface tint opacity for an elevation, interpolated across {@link ELEVATION_STOPS}.
 *
 * Linear between stops, clamped outside the range — Flutter's algorithm, not an approximation of it.
 *
 * @param elevation - the elevation, in logical pixels.
 * @returns the tint opacity, 0–1.
 */
export function surfaceTintOpacity(elevation: number): number {
  const first = ELEVATION_STOPS[0]!;
  const last = ELEVATION_STOPS[ELEVATION_STOPS.length - 1]!;
  if (elevation <= first.elevation) return first.opacity;
  if (elevation >= last.elevation) return last.opacity;
  for (let index = 1; index < ELEVATION_STOPS.length; index++) {
    const upper = ELEVATION_STOPS[index]!;
    if (elevation > upper.elevation) continue;
    if (elevation === upper.elevation) return upper.opacity;
    const lower = ELEVATION_STOPS[index - 1]!;
    const t = (elevation - lower.elevation) / (upper.elevation - lower.elevation);
    return lower.opacity + t * (upper.opacity - lower.opacity);
  }
  return last.opacity;
}

/**
 * A component's default, or `undefined` if the catalog states none.
 *
 * @param component - the Material component's name, e.g. `Card`.
 * @param field - the default's name, e.g. `elevation`.
 * @returns the value.
 */
export function componentDefault(component: string, field: string): number | string | undefined {
  return COMPONENT_DEFAULTS[component]?.[field];
}

/**
 * Flutter's easing curves → their CSS timing function.
 *
 * Flutter declares most of its curves as `Cubic(x1, y1, x2, y2)` (animation/curves.dart), which **is**
 * CSS's `cubic-bezier(x1, y1, x2, y2)`: the same four control points of the same unit cubic Bezier. That
 * correspondence is what lets the implicit-animation family be implemented with no animation engine — the
 * browser interpolates, on exactly the curve the Flutter source named.
 *
 * A curve with no CSS equivalent is **absent rather than approximated**: `decelerate`, the two
 * `ThreePointCubic`s, and the bounce and elastic families. A generator that meets one refuses it by name.
 */
export const CURVES: Readonly<Record<string, string>> = Object.freeze({
  "ease": "cubic-bezier(0.25, 0.1, 0.25, 1.0)",
  "easeIn": "cubic-bezier(0.42, 0.0, 1.0, 1.0)",
  "easeInBack": "cubic-bezier(0.6, -0.28, 0.735, 0.045)",
  "easeInCirc": "cubic-bezier(0.6, 0.04, 0.98, 0.335)",
  "easeInCubic": "cubic-bezier(0.55, 0.055, 0.675, 0.19)",
  "easeInExpo": "cubic-bezier(0.95, 0.05, 0.795, 0.035)",
  "easeInOut": "cubic-bezier(0.42, 0.0, 0.58, 1.0)",
  "easeInOutBack": "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
  "easeInOutCirc": "cubic-bezier(0.785, 0.135, 0.15, 0.86)",
  "easeInOutCubic": "cubic-bezier(0.645, 0.045, 0.355, 1.0)",
  "easeInOutExpo": "cubic-bezier(1.0, 0.0, 0.0, 1.0)",
  "easeInOutQuad": "cubic-bezier(0.455, 0.03, 0.515, 0.955)",
  "easeInOutQuart": "cubic-bezier(0.77, 0.0, 0.175, 1.0)",
  "easeInOutQuint": "cubic-bezier(0.86, 0.0, 0.07, 1.0)",
  "easeInOutSine": "cubic-bezier(0.445, 0.05, 0.55, 0.95)",
  "easeInQuad": "cubic-bezier(0.55, 0.085, 0.68, 0.53)",
  "easeInQuart": "cubic-bezier(0.895, 0.03, 0.685, 0.22)",
  "easeInQuint": "cubic-bezier(0.755, 0.05, 0.855, 0.06)",
  "easeInSine": "cubic-bezier(0.47, 0.0, 0.745, 0.715)",
  "easeInToLinear": "cubic-bezier(0.67, 0.03, 0.65, 0.09)",
  "easeOut": "cubic-bezier(0.0, 0.0, 0.58, 1.0)",
  "easeOutBack": "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
  "easeOutCirc": "cubic-bezier(0.075, 0.82, 0.165, 1.0)",
  "easeOutCubic": "cubic-bezier(0.215, 0.61, 0.355, 1.0)",
  "easeOutExpo": "cubic-bezier(0.19, 1.0, 0.22, 1.0)",
  "easeOutQuad": "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
  "easeOutQuart": "cubic-bezier(0.165, 0.84, 0.44, 1.0)",
  "easeOutQuint": "cubic-bezier(0.23, 1.0, 0.32, 1.0)",
  "easeOutSine": "cubic-bezier(0.39, 0.575, 0.565, 1.0)",
  "fastLinearToSlowEaseIn": "cubic-bezier(0.18, 1.0, 0.04, 1.0)",
  "fastOutSlowIn": "cubic-bezier(0.4, 0.0, 0.2, 1.0)",
  "linear": "linear",
  "linearToEaseOut": "cubic-bezier(0.35, 0.91, 0.33, 0.97)",
  "slowMiddle": "cubic-bezier(0.15, 0.85, 0.85, 0.15)",
});

/**
 * The CSS timing function for a Flutter curve, or `undefined` if it has none.
 *
 * @param curve - the curve's name, e.g. `easeInOut`.
 * @returns the CSS `transition-timing-function` value.
 */
export function timingFunction(curve: string): string | undefined {
  return CURVES[curve];
}
