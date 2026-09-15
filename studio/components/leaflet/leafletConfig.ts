import type {FeatureStyle, PinFlashOptions} from '@adayin/map-core/render'

export const DEFAULT_CENTER: [number, number] = [20, 0]
export const DEFAULT_ZOOM = 2
export const VALUE_ZOOM = 13
export const PIN_COLOR = '#0f766e'
export const FEATURE_STYLE: FeatureStyle = {
  color: '#0f766e',
  weight: 3,
  opacity: 0.85,
  fillOpacity: 0.15,
}
// Feature points (dots) use amber so they aren't confused with the stop pin.
export const POINT_COLOR = '#b45309'
// The blink (flashPin) for a pin or dot a place search just landed — the map
// jumps instantly, so the editor needs telling where it went.
export const PIN_FLASH: PinFlashOptions = {
  enabled: true,
  blinks: 3,
  halfPeriodMs: 180,
  minOpacity: 0.1,
  startDelay: 250,
}
