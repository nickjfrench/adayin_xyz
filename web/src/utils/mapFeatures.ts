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
// registry entry (studio/components/leaflet/shapes.ts). Points and text labels
// are map annotations; polygons/circles make a stop clickable without a pin.
export const SHAPE_RENDERERS: Record<string, (f: MapFeatureSlim) => L.Layer | null> = {
  point: (f) => (f.position ? L.marker(toLatLng(f.position), { icon: dotIcon() }) : null),
  text: (f) => (f.label && f.position ? L.marker(toLatLng(f.position), { icon: textLabelIcon(f.label) }) : null),
  polygon: (f) => (f.points.length >= 3 ? L.polygon(f.points.map(toLatLng), FEATURE_STYLE) : null),
  circle: (f) =>
    f.position && f.radius
      ? L.circle([f.position.lat, f.position.lng], { ...FEATURE_STYLE, radius: f.radius })
      : null,
};

/** Renders a feature via the registry, binding its label as tooltip when present. */
export function featureLayer(f: MapFeatureSlim): L.Layer | null {
  const layer = SHAPE_RENDERERS[f.shape]?.(f) ?? null;
  // Text labels render their content in the marker itself; only the other
  // shapes carry a Leaflet tooltip.
  if (layer && f.label && f.shape !== 'text') layer.bindTooltip(f.label);
  return layer;
}

/** Viewport envelope of a feature, or null when its geometry is missing. */
export function featureBounds(f: MapFeatureSlim): L.LatLngBounds | null {
  if (f.position && (f.shape === 'circle' || f.shape === 'point' || f.shape === 'text')) {
    const marker = f.shape === 'circle' && f.radius ? L.latLng(f.position.lat, f.position.lng).toBounds(f.radius * 2) : null;
    if (marker) return marker;
    // Zero-area corner pair for points/text; fitBounds padding handles it.
    return L.latLngBounds([toLatLng(f.position), toLatLng(f.position)]);
  }
  if (f.shape === 'polygon' && f.points.length > 0) {
    return L.latLngBounds(f.points.map(toLatLng));
  }
  return null;
}

/** Small teal dot matching the studio's feature points (createDotIcon style). */
function dotIcon(): L.DivIcon {
  const size = 12;
  const ring = 2;
  const total = size + ring * 2;
  return L.divIcon({
    className: '',
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${FEATURE_STYLE.color};box-shadow:0 0 0 ${ring}px #fff, 0 1px 3px rgba(0,0,0,0.35)"></span>`,
    iconSize: [total, total],
    iconAnchor: [total / 2, total / 2],
  });
}

/** White pill with the label text — 12px/600, centered on the point. */
function textLabelIcon(label: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html:
      `<span style="display:inline-block;transform:translate(-50%,-50%);` +
      `font:600 12px/1.2 system-ui, sans-serif;color:#1f2937;` +
      `background:rgba(255,255,255,0.9);border:1px solid rgba(0,0,0,0.15);border-radius:4px;` +
      `padding:1px 5px;white-space:nowrap">${label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`,
    iconSize: [0, 0],
  });
}
