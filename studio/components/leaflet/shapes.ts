import L from 'leaflet'
import {
  SHAPE_NAMES,
  circleLayer,
  pointLayer,
  polygonLayer,
  type MapFeature,
  type ShapeName,
} from '@adayin/map-core'
import {FEATURE_STYLE, POINT_COLOR} from './leafletConfig'

/** The studio's name for the shared feature type — editor vocabulary. Stored
 * studio features always carry their key and type; the shared type keeps both
 * optional because the web's slim items don't have them. */
export type MapFeatureItem = MapFeature & {_key: string; _type: 'mapFeature'}

export interface ShapeDef {
  name: ShapeName
  glyph: string
  detect(layer: L.Layer): boolean
  layerFromFeature(f: MapFeatureItem): L.Layer | null
  featureFromLayer(
    layer: L.Layer
  ): Pick<MapFeatureItem, 'shape' | 'position' | 'radius' | 'points'> & {label?: string} | null
}

/** All studio feature layers render with the studio's own look: teal regions,
 * amber points (the site's itinerary map passes its per-stop palette). */
const LAYER_OPTS = {style: FEATURE_STYLE, pointColor: POINT_COLOR, pointSize: 12}

/**
 * The editing registry — Geoman detect/extract plus the shared render
 * primitives from @adayin/map-core. Adding a shape kind is one entry in
 * map-core (SHAPE_NAMES + render primitive) plus one entry here; the schema
 * list derives from SHAPE_NAMES.
 * A region is what makes a stop clickable on the itinerary map; point and
 * text markers add map annotations. Markers must check textMarker before the
 * point def so Geoman text markers don't classify as points.
 */
/** A Geoman text marker carries its editable content in `options.text`. */
type TextMarker = L.Marker & {options: {textMarker?: boolean; text?: string}}
export const SHAPE_DEFS: Record<ShapeName, ShapeDef> = {
  point: {
    name: 'point',
    glyph: '●',
    detect: (layer) =>
      layer instanceof L.Marker && !(layer as TextMarker).options.textMarker,
    layerFromFeature: (f) => pointLayer(f, LAYER_OPTS),
    featureFromLayer: (layer) =>
      layer instanceof L.Marker
        ? {shape: 'point', position: {lat: layer.getLatLng().lat, lng: layer.getLatLng().lng}}
        : null,
  },
  text: {
    name: 'text',
    glyph: 'T',
    detect: (layer) => (layer as TextMarker).options.textMarker === true,
    // Geoman's own text marker — it owns the editable content, so this one
    // layer is not drawn by the shared primitives.
    layerFromFeature: (f) =>
      f.position
        ? L.marker([f.position.lat, f.position.lng], {textMarker: true, text: f.label ?? ''})
        : null,
    featureFromLayer: (layer) => {
      const marker = layer as TextMarker
      if (marker.options?.textMarker !== true) return null
      return {
        shape: 'text',
        position: {lat: marker.getLatLng().lat, lng: marker.getLatLng().lng},
        label: marker.options.text ?? undefined,
      }
    },
  },
  polygon: {
    name: 'polygon',
    glyph: '⬟',
    detect: (layer) => layer instanceof L.Polygon,
    layerFromFeature: (f) => polygonLayer(f, LAYER_OPTS),
    featureFromLayer: (layer) => {
      if (!(layer instanceof L.Polygon)) return null
      const latlngs = layer.getLatLngs() as Array<L.LatLng | L.LatLng[]>
      const ring = (Array.isArray(latlngs[0]) ? latlngs[0] : latlngs) as L.LatLng[]
      return {shape: 'polygon', points: ring.map((p) => ({lat: p.lat, lng: p.lng}))}
    },
  },
  circle: {
    name: 'circle',
    glyph: '◯',
    detect: (layer) => layer instanceof L.Circle,
    layerFromFeature: (f) => circleLayer(f, LAYER_OPTS),
    featureFromLayer: (layer) =>
      layer instanceof L.Circle
        ? {
            shape: 'circle',
            position: {lat: layer.getLatLng().lat, lng: layer.getLatLng().lng},
            radius: layer.getRadius(),
          }
        : null,
  },
}

/** Registry-driven dispatch: returns the def whose detect() matches, else null. */
export function shapeFromLayer(layer: L.Layer): ShapeDef | null {
  for (const name of SHAPE_NAMES) {
    if (SHAPE_DEFS[name].detect(layer)) return SHAPE_DEFS[name]
  }
  return null
}
