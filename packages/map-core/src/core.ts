/**
 * Renderer-free half of the map kit — safe to import from SSR/build-time code
 * (the web app's mapFocus runs during the Astro build). Types, the stored
 * contract, and geometry; everything that needs a map lives behind ./geojson
 * (conversion), ./dom (browser effects) and ./basemap (MapLibre bootstrap).
 */

export type ShapeName = 'point' | 'text' | 'polygon' | 'circle'
export const SHAPE_NAMES = ['point', 'text', 'polygon', 'circle'] as const

export interface MapFeaturePoint {
  lat: number
  lng: number
}

/**
 * Stored geopoint member: the geometry fields plus the `_key`/`_type` Sanity
 * writes onto array members. Both stay optional because the web's slim items
 * (from [slug].astro) hand over bare `{lat, lng}` objects.
 */
export interface MapFeaturePointMember extends MapFeaturePoint {
  _key?: string
  _type?: string
}

/**
 * The unified feature type: the studio's editor-drawn layers and the web app's
 * slim items (from [slug].astro) are both this shape. `_key`/`_type` are what
 * a stored Sanity member adds on top; stored geopoints carry their own
 * `_key`/`_type` keys too and satisfy MapFeaturePoint structurally.
 */
export interface MapFeature {
  _key?: string
  _type?: string
  label?: string | null
  shape: ShapeName
  position?: MapFeaturePointMember | null
  radius?: number | null
  points?: MapFeaturePointMember[] | null
}

/** A stored mapFeatures member: the feature plus the array keys Sanity persists. */
export type MapFeatureItem = MapFeature & { _key: string; _type: 'mapFeature' }

/** Renderer-free geometry slice of a feature — what an editor serializes. */
export type MapFeatureGeometry = Pick<
  MapFeature,
  'shape' | 'position' | 'radius' | 'points' | 'label'
>

/** Degree envelope of a feature, in the order the map libraries consume. */
export interface MapBounds {
  south: number
  west: number
  north: number
  east: number
}

/**
 * Earth radius in metres — the sphere the stored circle radii were measured on
 * (Leaflet's R), kept so stored radii and every metres↔degrees conversion here
 * stay in one unit system.
 */
export const EARTH_RADIUS_M = 6371000

export interface LocationValue {
  lat?: number | null
  lng?: number | null
  formattedAddress?: string | null
  mapsUri?: string | null
}

/** Google Maps search URL for a raw pin — used when the location was set manually (no Place URI). */
export function mapsQueryUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}

/**
 * Per-shape geometry test matching the renderers of the same names — true when
 * the feature actually draws something. An unknown shape draws nothing (both
 * the map renderer and the GeoJSON conversion skip it), so it is not drawable
 * however complete its geometry looks.
 */
export function featureIsDrawable(
  f: Pick<MapFeature, 'shape' | 'position' | 'radius' | 'points' | 'label'>,
): boolean {
  switch (f.shape) {
    case 'circle':
      return Boolean(f.position && f.radius)
    case 'polygon':
      return (f.points?.length ?? 0) >= 3
    case 'text':
      return Boolean(f.label && f.position)
    case 'point':
      return Boolean(f.position)
    default:
      return false
  }
}

/**
 * Builds the stored member an editor writes for one feature — field for field
 * the object the studio's layer→item conversion has always produced: always
 * `shape`; `position` gains `_type: 'geopoint'`; `radius`/`label` are written
 * only when set; polygon vertices get a fresh `_key` per geometry change. The
 * feature's own `_key` is the caller's key, never regenerated here.
 */
export function serializeMapFeature(
  geometry: MapFeatureGeometry,
  key: string,
  nextPointKey: () => string,
): MapFeatureItem {
  const stored: MapFeatureItem = { _key: key, _type: 'mapFeature', shape: geometry.shape }
  if (geometry.position) {
    stored.position = { _type: 'geopoint', lat: geometry.position.lat, lng: geometry.position.lng }
  }
  if (typeof geometry.radius === 'number') stored.radius = geometry.radius
  if (geometry.label) stored.label = geometry.label
  if (geometry.points?.length) {
    stored.points = geometry.points.map((point) => ({
      _key: nextPointKey(),
      _type: 'geopoint',
      lat: point.lat,
      lng: point.lng,
    }))
  }
  return stored
}

/**
 * Viewport envelope of a feature, or null when its geometry is missing.
 * Unlike featureIsDrawable, a text feature needs only a position here — a
 * just-created text layer has no label yet but still frames the view. A
 * radius-less circle frames nothing either: it draws nothing to fly to.
 */
export function mapFeatureBounds(
  feature: Pick<MapFeature, 'shape' | 'position' | 'points' | 'radius'>,
): MapBounds | null {
  const position = feature.position
  if (feature.shape === 'circle') {
    if (!position || !feature.radius) return null
    // Metres→degrees at the circle's latitude, longitude widened by 1/cos(lat).
    const latAccuracy = (feature.radius / EARTH_RADIUS_M) * (180 / Math.PI)
    const lngAccuracy = latAccuracy / Math.cos((position.lat * Math.PI) / 180)
    return {
      south: position.lat - latAccuracy,
      west: position.lng - lngAccuracy,
      north: position.lat + latAccuracy,
      east: position.lng + lngAccuracy,
    }
  }
  if (position && (feature.shape === 'point' || feature.shape === 'text')) {
    // Zero-area envelope for points/text; fitBounds padding handles it.
    return {
      south: position.lat,
      west: position.lng,
      north: position.lat,
      east: position.lng,
    }
  }
  const points = feature.points
  if (feature.shape === 'polygon' && points && points.length > 0) {
    let south = Infinity
    let west = Infinity
    let north = -Infinity
    let east = -Infinity
    for (const point of points) {
      if (point.lat < south) south = point.lat
      if (point.lat > north) north = point.lat
      if (point.lng < west) west = point.lng
      if (point.lng > east) east = point.lng
    }
    return { south, west, north, east }
  }
  return null
}

/**
 * Signature over geometry + labels only: polygon point-member keys are
 * regenerated on every geometry patch, so they must not read as a redraw.
 */
export function mapFeaturesSignature(items: readonly MapFeatureItem[]): string {
  return JSON.stringify(
    items.map((i) => [
      i._key,
      i.label ?? null,
      i.shape,
      i.position?.lat ?? null,
      i.position?.lng ?? null,
      i.radius ?? null,
      (i.points ?? []).map((p) => [p.lat, p.lng]),
    ]),
  )
}

// Quadratic bezier a→b bulged perpendicular; offsetIndex 0 → straight line.
// Both branches return 25 samples so the t=0.5 apex sample (pts[12]) always exists.
export function arcPoints(
  a: [number, number],
  b: [number, number],
  offsetIndex: number,
): [number, number][] {
  if (offsetIndex === 0) {
    const pts: [number, number][] = []
    for (let s = 0; s <= 24; s++) {
      const t = s / 24,
        u = 1 - t
      pts.push([u * a[0] + t * b[0], u * a[1] + t * b[1]])
    }
    return pts
  }
  const [lat1, lng1] = a,
    [lat2, lng2] = b
  const midLat = (lat1 + lat2) / 2
  const cosLat = Math.cos((midLat * Math.PI) / 180)
  const dLat = lat2 - lat1
  const dLng = (lng2 - lng1) * cosLat
  const len = Math.hypot(dLat, dLng) || 1e-9
  const pLat = -dLng / len // unit perpendicular (lat component)
  const pLng = dLat / len / cosLat // unit perpendicular (lng component, un-corrected)
  const bulge = Math.min(0.03, Math.max(0.0008, len * 0.18)) * offsetIndex
  const cLat = midLat + pLat * bulge
  const cLng = (lng1 + lng2) / 2 + pLng * bulge
  const pts: [number, number][] = []
  for (let s = 0; s <= 24; s++) {
    const t = s / 24,
      u = 1 - t
    pts.push([
      u * u * lat1 + 2 * u * t * cLat + t * t * lat2,
      u * u * lng1 + 2 * u * t * cLng + t * t * lng2,
    ])
  }
  return pts
}
