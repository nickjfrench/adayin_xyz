/**
 * Leaflet-free half of the map kit — safe to import from SSR/build-time code
 * (the web app's mapFocus runs during the Astro build). Everything that needs
 * Leaflet lives in render.ts / tiles.ts.
 */

export type ShapeName = 'point' | 'text' | 'polygon' | 'circle';
export const SHAPE_NAMES = ['point', 'text', 'polygon', 'circle'] as const;

export interface MapFeaturePoint {
  lat: number;
  lng: number;
}

/**
 * The unified feature type: the studio's editor-drawn layers and the web app's
 * slim items (from [slug].astro) are both this shape. `_key`/`_type` are what
 * a stored Sanity member adds on top; stored geopoints carry their own
 * `_key`/`_type` keys too and satisfy MapFeaturePoint structurally.
 */
export interface MapFeature {
  _key?: string;
  _type?: string;
  label?: string | null;
  shape: ShapeName;
  position?: MapFeaturePoint | null;
  radius?: number | null;
  points?: MapFeaturePoint[] | null;
}

export interface LocationValue {
  lat?: number | null;
  lng?: number | null;
  formattedAddress?: string | null;
  mapsUri?: string | null;
}

/** Google Maps search URL for a raw pin — used when the location was set manually (no Place URI). */
export function mapsQueryUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}

/**
 * Per-shape geometry test matching the render primitive of the same name
 * (render.ts) — true when the feature actually draws something.
 */
export function featureIsDrawable(
  f: Pick<MapFeature, 'shape' | 'position' | 'radius' | 'points' | 'label'>,
): boolean {
  switch (f.shape) {
    case 'circle':
      return Boolean(f.position && f.radius);
    case 'polygon':
      return (f.points?.length ?? 0) >= 3;
    case 'text':
      return Boolean(f.label && f.position);
    default: // point
      return Boolean(f.position);
  }
}

// Quadratic bezier a→b bulged perpendicular; offsetIndex 0 → straight line.
// Both branches return 25 samples so the t=0.5 apex sample (pts[12]) always exists.
export function arcPoints(
  a: [number, number],
  b: [number, number],
  offsetIndex: number,
): [number, number][] {
  if (offsetIndex === 0) {
    const pts: [number, number][] = [];
    for (let s = 0; s <= 24; s++) {
      const t = s / 24, u = 1 - t;
      pts.push([u * a[0] + t * b[0], u * a[1] + t * b[1]]);
    }
    return pts;
  }
  const [lat1, lng1] = a, [lat2, lng2] = b;
  const midLat = (lat1 + lat2) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const dLat = lat2 - lat1;
  const dLng = (lng2 - lng1) * cosLat;
  const len = Math.hypot(dLat, dLng) || 1e-9;
  const pLat = -dLng / len; // unit perpendicular (lat component)
  const pLng = dLat / len / cosLat; // unit perpendicular (lng component, un-corrected)
  const bulge = Math.min(0.03, Math.max(0.0008, len * 0.18)) * offsetIndex;
  const cLat = midLat + pLat * bulge;
  const cLng = (lng1 + lng2) / 2 + pLng * bulge;
  const pts: [number, number][] = [];
  for (let s = 0; s <= 24; s++) {
    const t = s / 24, u = 1 - t;
    pts.push([
      u * u * lat1 + 2 * u * t * cLat + t * t * lat2,
      u * u * lng1 + 2 * u * t * cLng + t * t * lng2,
    ]);
  }
  return pts;
}

