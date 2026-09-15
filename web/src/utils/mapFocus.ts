import { featureIsDrawable, type MapFeature } from '@adayin/map-core/core';

/** The slice of a map item this predicate reads — [slug].astro's `mapStops`. */
export interface MapFocusItem {
  _type?: string;
  location?: { lat?: number | null; lng?: number | null } | null;
  features?: MapFeature[] | null;
}

/**
 * True when the map has something to fly to for this item: a pin location, or a
 * feature whose shape actually draws (featureIsDrawable in @adayin/map-core —
 * update both when a shape is added). Travel legs anchor no marker of their
 * own, so they never qualify.
 *
 * Leaflet-free on purpose: [slug].astro calls this at build time. Only the
 * Leaflet-free entry of the kit (map-core/core) may be imported here — a value
 * import from the kit root or from map-core/render would drag Leaflet into
 * SSR and crash the build.
 */
export function isMapFocusable(item?: MapFocusItem | null): boolean {
  if (!item || item._type === 'travel') return false;
  const { lat, lng } = item.location ?? {};
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) return true;
  return (item.features ?? []).some(featureIsDrawable);
}
