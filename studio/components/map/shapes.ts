import {
  mapFeaturePatchFromGeoJSON,
  mapFeatureToGeoJSON,
  type MapFeatureGeoJSON,
} from '@adayin/map-core/geojson'
import { serializeMapFeature, type MapFeatureItem, type ShapeName } from '@adayin/map-core/core'
import type { FeatureData, Geoman } from '@geoman-io/maplibre-geoman-free'

/** Glyph shown beside a feature in the studio's list. */
export const SHAPE_GLYPHS: Record<ShapeName, string> = {
  point: '📍',
  text: 'T',
  polygon: '⬟',
  circle: '◯',
}

/**
 * The studio's bridge between stored mapFeatures members and the editor's
 * GeoJSON. Geoman owns the drawing surface: it imports stored items through
 * `featureGeoJson`, hands back its own features on every event, and the
 * conversions below turn those back into the stored member — always merging
 * into the raw item, so fields the conversion doesn't own (labels, keys, and
 * anything a future schema adds) survive untouched.
 */

export type { MapFeatureItem }

/** GeoJSON for one stored item, as Geoman's import wants it. */
function featureGeoJson(item: MapFeatureItem) {
  return mapFeatureToGeoJSON(item, item._key)
}

/**
 * Geoman types its features with the generic geojson package's `Feature`, whose
 * `Position` is `number[]` and whose id is optional — a shape TypeScript cannot
 * unify with the tuple-based GeoJSON this conversion produces. The conversion
 * validates everything it reads and returns null for geometry it can't use, so
 * the adapter bridges the two types here, once.
 */
function geomanGeoJson(feature: FeatureData): MapFeatureGeoJSON {
  return feature.getGeoJson() as unknown as MapFeatureGeoJSON
}

/** Geoman's own import type, derived so the cast below stays honest. */
type GeomanImport = Parameters<Geoman['features']['importGeoJson']>[0]

/**
 * Imports stored items into the editor: one conversion for every caller, so
 * the editor always starts from the same GeoJSON the store describes.
 */
export function importFeatures(geoman: Geoman, items: MapFeatureItem[]): Promise<unknown> {
  const collection = {
    type: 'FeatureCollection' as const,
    features: items.map(featureGeoJson).filter((f): f is MapFeatureGeoJSON => Boolean(f)),
  }
  // Geoman's d.ts narrows `shape` to its own name union; the conversion emits
  // exactly those names (marker, text_marker, polygon, circle). The stored
  // `_key` rides on each feature's top-level `id`, so no idPropertyName.
  return geoman.features.importGeoJson(collection as unknown as GeomanImport, { overwrite: true })
}

/** Stored shape name for a Geoman feature, or null for shapes we have no name for. */
function storedShape(feature: FeatureData): ShapeName | null {
  switch (feature.shape) {
    case 'marker':
      return 'point'
    case 'text_marker':
      return 'text'
    case 'polygon':
      return 'polygon'
    case 'circle':
      return 'circle'
    default:
      return null
  }
}

/**
 * The stored member a freshly drawn feature appends: its geometry serialized
 * with a fresh key (the caller has already written that key onto the feature).
 */
export function itemFromFeature(feature: FeatureData, key: string): MapFeatureItem | null {
  const shape = storedShape(feature)
  if (!shape) return null
  const nextPointKey = () => crypto.randomUUID()
  const geometry = mapFeaturePatchFromGeoJSON(
    geomanGeoJson(feature),
    { _key: key, _type: 'mapFeature', shape },
    nextPointKey,
  )
  return geometry ? serializeMapFeature(geometry, key, nextPointKey) : null
}

/**
 * The stored member an edit or drag writes: only the edited geometry is
 * converted, then merged over the raw item so untouched keys stay verbatim.
 */
export function mergedItem(feature: FeatureData, existing: MapFeatureItem): MapFeatureItem | null {
  const geometry = mapFeaturePatchFromGeoJSON(geomanGeoJson(feature), existing, () =>
    crypto.randomUUID(),
  )
  return geometry ? { ...existing, ...geometry } : null
}

/** Label for a feature's tooltip: the text marker's text wins over the stored label. */
export function featureLabel(feature: FeatureData): string | null {
  const properties = feature.getGeoJson().properties ?? {}
  const label = feature.shape === 'text_marker' ? (properties.__gm_text ?? properties.text) : null
  const text = label ?? properties.label
  return typeof text === 'string' && text.trim() ? text : null
}
