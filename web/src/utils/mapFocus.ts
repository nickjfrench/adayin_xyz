import type { MapFeatureSlim } from './mapFeatures';

/** The slice of a map item this predicate reads — [slug].astro's `mapStops`. */
export interface MapFocusItem {
  _type?: string;
  location?: { lat?: number | null; lng?: number | null } | null;
  features?: MapFeatureSlim[] | null;
}

/**
 * True when the map has something to fly to for this item: a pin location, or a
 * feature whose shape actually draws (mirrors SHAPE_RENDERERS in mapFeatures.ts
 * — update both when a shape is added). Travel legs anchor no marker of their
 * own, so they never qualify.
 *
 * Leaflet-free on purpose: [slug].astro calls this at build time. Only the TYPE
 * of MapFeatureSlim may be imported here — a value import from mapFeatures.ts
 * would drag Leaflet into SSR and crash the build.
 */
export function isMapFocusable(item?: MapFocusItem | null): boolean {
  if (!item || item._type === 'travel') return false;
  const { lat, lng } = item.location ?? {};
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) return true;
  return (item.features ?? []).some(featureDraws);
}

/** Per-shape geometry test matching the SHAPE_RENDERERS entry of the same name. */
function featureDraws(f: MapFeatureSlim): boolean {
  switch (f.shape) {
    case 'circle':
      return Boolean(f.position && f.radius);
    case 'polygon':
      return f.points.length >= 3;
    case 'text':
      return Boolean(f.label && f.position);
    default: // point
      return Boolean(f.position);
  }
}
