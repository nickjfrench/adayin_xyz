// Constants mirroring the site's itinerary map (web/src/utils/itineraryMap.ts).
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_OPTIONS = {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}
export const DEFAULT_CENTER: [number, number] = [20, 0]
export const DEFAULT_ZOOM = 2
export const VALUE_ZOOM = 13
export const PIN_COLOR = '#0f766e'
export const FEATURE_STYLE = {color: '#0f766e', weight: 3, opacity: 0.85, fillOpacity: 0.15}
