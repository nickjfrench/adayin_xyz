import L from 'leaflet';

export interface MapFeatureSlim {
  label: string | null;
  shape: string;
  position: { lat: number; lng: number } | null;
  radius: number | null;
  // The slim mapping in [slug].astro always produces an array.
  points: Array<{ lat: number; lng: number }>;
}

// --color-sea-500
export const FEATURE_STYLE = {
  color: 'oklch(0.53 0.085 185)',
  weight: 3,
  opacity: 0.8,
  fillOpacity: 0.12,
  lineCap: 'round',
};

const toLatLng = (p: { lat: number; lng: number }) => [p.lat, p.lng] as [number, number];

// One entry per shape kind — adding a shape later = one entry here + one studio
// registry entry (studio/components/leaflet/shapes.ts). Only area shapes:
// a region makes a stop clickable without a pin.
export const SHAPE_RENDERERS: Record<string, (f: MapFeatureSlim) => L.Layer | null> = {
  polygon: (f) => (f.points.length >= 3 ? L.polygon(f.points.map(toLatLng), FEATURE_STYLE) : null),
  circle: (f) =>
    f.position && f.radius
      ? L.circle([f.position.lat, f.position.lng], { ...FEATURE_STYLE, radius: f.radius })
      : null,
};

/** Renders a feature via the registry, binding its label as tooltip when present. */
export function featureLayer(f: MapFeatureSlim): L.Layer | null {
  const layer = SHAPE_RENDERERS[f.shape]?.(f) ?? null;
  if (layer && f.label) layer.bindTooltip(f.label);
  return layer;
}

/** Viewport envelope of a feature, or null when its geometry is missing. */
export function featureBounds(f: MapFeatureSlim): L.LatLngBounds | null {
  if (f.shape === 'circle' && f.position && f.radius) {
    return L.latLng(f.position.lat, f.position.lng).toBounds(f.radius * 2);
  }
  if (f.shape === 'polygon' && f.points.length > 0) {
    return L.latLngBounds(f.points.map(toLatLng));
  }
  return null;
}
