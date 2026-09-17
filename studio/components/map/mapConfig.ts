import type { PinFlashOptions } from '@adayin/map-core/dom'

/** [lng, lat] — MapLibre's coordinate order, not the stored lat/lng order. */
export const DEFAULT_CENTER: [number, number] = [0, 20]
export const DEFAULT_ZOOM = 2
export const VALUE_ZOOM = 13
// Geoman draws point features with its own `default-marker` pin: 200px art at
// icon-size 0.18 → a 36px box, bottom-anchored on the coordinate. The marker
// layer hit-tests that whole box (up to 18px from the point in every
// direction), which shadows whatever region lies under the pin, so the studio
// hit-tests the drawn shape instead — see StopMapInput's featureAt.
export const MARKER_HEIGHT = 36
// The pin's head: a circle this wide, centred this far above the anchor.
export const MARKER_HEAD_UP = 23
export const MARKER_HEAD_RADIUS = 14
// Head-to-tip taper, fitted to the art's alpha profile: the half-width at `up`
// px above the anchor is MARKER_HEAD_RADIUS * (up / MARKER_HEAD_UP) ** this.
export const MARKER_TAIL_EXPONENT = 0.6
/** The location pin's teal dot; features are drawn by Geoman's own styles. */
export const PIN_COLOR = '#0f766e'
// The blink (flashPin) for a pin or feature a place search just landed — the map
// jumps instantly, so the editor needs telling where it went.
export const PIN_FLASH: PinFlashOptions = {
  enabled: true,
  blinks: 3,
  halfPeriodMs: 180,
  minOpacity: 0.1,
  startDelay: 250,
}
