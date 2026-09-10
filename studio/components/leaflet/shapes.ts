import L from 'leaflet'
import {FEATURE_STYLE, PIN_COLOR} from './leafletConfig'

export type ShapeName = 'point' | 'polyline' | 'polygon' | 'circle'
export const SHAPE_NAMES = ['point', 'polyline', 'polygon', 'circle'] as const

export interface MapFeatureItem {
  _key: string
  _type: 'mapFeature'
  shape: ShapeName
  label?: string
  position?: {lat: number; lng: number}
  radius?: number
  // Stored members also carry _key/_type — ignored by renderers.
  points?: Array<{lat: number; lng: number}>
}

export interface ShapeDef {
  name: ShapeName
  glyph: string
  detect(layer: L.Layer): boolean
  layerFromFeature(f: MapFeatureItem): L.Layer | null
  featureFromLayer(layer: L.Layer): Pick<MapFeatureItem, 'shape' | 'position' | 'radius' | 'points'> | null
  boundsOf(f: MapFeatureItem): L.LatLngBounds | null
}

/**
 * The shape registry — single source of truth for shape behavior. A new shape
 * kind is ONE entry here plus one entry in the web renderer registry
 * (web/src/utils/mapFeatures.ts); the schema list derives from SHAPE_NAMES.
 * Detection order follows SHAPE_NAMES: L.Polygon must be excluded from
 * polyline (it extends Polyline), so polygon is detected before falling through.
 */
export const SHAPE_DEFS: Record<ShapeName, ShapeDef> = {
  point: {
    name: 'point',
    glyph: '●',
    detect: (layer) => layer instanceof L.Marker,
    layerFromFeature: (f) =>
      f.position ? L.marker([f.position.lat, f.position.lng], {icon: createDotIcon(16)}) : null,
    featureFromLayer: (layer) =>
      layer instanceof L.Marker
        ? {shape: 'point', position: {lat: layer.getLatLng().lat, lng: layer.getLatLng().lng}}
        : null,
    boundsOf: (f) => (f.position ? L.latLngBounds([[f.position.lat, f.position.lng]]) : null),
  },
  polyline: {
    name: 'polyline',
    glyph: '⋯',
    detect: (layer) => layer instanceof L.Polyline && !(layer instanceof L.Polygon),
    layerFromFeature: (f) =>
      f.points && f.points.length >= 2
        ? L.polyline(f.points.map((p) => [p.lat, p.lng]), FEATURE_STYLE)
        : null,
    featureFromLayer: (layer) =>
      layer instanceof L.Polyline
        ? {
            shape: 'polyline',
            points: (layer.getLatLngs() as L.LatLng[]).map((p) => ({lat: p.lat, lng: p.lng})),
          }
        : null,
    boundsOf: (f) =>
      f.points && f.points.length > 0 ? L.latLngBounds(f.points.map((p) => [p.lat, p.lng])) : null,
  },
  polygon: {
    name: 'polygon',
    glyph: '⬟',
    detect: (layer) => layer instanceof L.Polygon,
    layerFromFeature: (f) =>
      f.points && f.points.length >= 3
        ? L.polygon(f.points.map((p) => [p.lat, p.lng]), FEATURE_STYLE)
        : null,
    featureFromLayer: (layer) => {
      if (!(layer instanceof L.Polygon)) return null
      const latlngs = layer.getLatLngs() as Array<L.LatLng | L.LatLng[]>
      const ring = (Array.isArray(latlngs[0]) ? latlngs[0] : latlngs) as L.LatLng[]
      return {shape: 'polygon', points: ring.map((p) => ({lat: p.lat, lng: p.lng}))}
    },
    boundsOf: (f) =>
      f.points && f.points.length > 0 ? L.latLngBounds(f.points.map((p) => [p.lat, p.lng])) : null,
  },
  circle: {
    name: 'circle',
    glyph: '◯',
    detect: (layer) => layer instanceof L.Circle,
    layerFromFeature: (f) =>
      f.position && f.radius
        ? L.circle([f.position.lat, f.position.lng], {...FEATURE_STYLE, radius: f.radius})
        : null,
    featureFromLayer: (layer) =>
      layer instanceof L.Circle
        ? {
            shape: 'circle',
            position: {lat: layer.getLatLng().lat, lng: layer.getLatLng().lng},
            radius: layer.getRadius(),
          }
        : null,
    boundsOf: (f) =>
      f.position && f.radius ? L.latLng(f.position.lat, f.position.lng).toBounds(f.radius * 2) : null,
  },
}

/** Registry-driven dispatch: returns the def whose detect() matches, else null. */
export function shapeFromLayer(layer: L.Layer): ShapeDef | null {
  for (const name of SHAPE_NAMES) {
    if (SHAPE_DEFS[name].detect(layer)) return SHAPE_DEFS[name]
  }
  return null
}

/**
 * Shared circular pin — inline-styled span with a white ring (className ''
 * drops Leaflet's default white box). Used by the geopoint marker and point
 * features so both render identically.
 */
export function createDotIcon(size: number): L.DivIcon {
  const ring = Math.max(2, Math.round(size / 8))
  const total = size + ring * 2
  return L.divIcon({
    className: '',
    html:
      `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;` +
      `background:${PIN_COLOR};box-shadow:0 0 0 ${ring}px #fff, 0 1px 3px rgba(0,0,0,0.35)"></span>`,
    iconSize: [total, total],
    iconAnchor: [total / 2, total / 2],
  })
}
