import L from 'leaflet';
import 'leaflet/dist/leaflet.css'; // the package owns its CSS
import { featureLayer, featureBounds, type MapFeatureSlim } from './mapFeatures';
import { STOP_OPEN_EVENT } from './mapEvents';

export interface MapStopItem {
  _type: string;
  title: string | null;
  location: { lat: number; lng: number } | null;
  icon: string | null;
  features: MapFeatureSlim[] | null;
}

// Full literal class strings (Tailwind v4 scans this file's text).
const MARKER_CONFIG: Record<string, { classes: string; label: string | null }> = {
  stop:          { classes: 'flex h-7 w-7 items-center justify-center rounded-full bg-sea-500 text-white ring-[3px] ring-white shadow-md',    label: null },
  startLocation: { classes: 'flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-[11px] font-bold text-white ring-[3px] ring-white shadow-md', label: 'S' },
  endLocation:   { classes: 'flex h-7 w-7 items-center justify-center rounded-full bg-sand-500 text-[11px] font-bold text-white ring-[3px] ring-white shadow-md',  label: 'E' },
};
const TRAVEL_ICON_CLASSES =
  'flex h-5 w-5 items-center justify-center rounded-full bg-sea-400 text-white ring-2 ring-white shadow';
// Pin glyph — same svg as StopCard.astro.
const PIN_SVG =
  '<svg class="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>';

const SEA_500 = 'oklch(0.53 0.085 185)'; // --color-sea-500
const SEA_300 = 'oklch(0.74 0.065 185)'; // --color-sea-300

type Located = { latlng: [number, number]; index: number };

function openStop(index: number) {
  window.dispatchEvent(new CustomEvent(STOP_OPEN_EVENT, { detail: index }));
}

function markerInner(item: MapStopItem, config: { label: string | null }) {
  if (config.label) return config.label;
  if (item.icon) return `<span class="block h-3.5 w-3.5 [&>svg]:h-3.5 [&>svg]:w-3.5">${item.icon}</span>`;
  return PIN_SVG;
}

function addStopMarker(map: L.Map, item: MapStopItem, index: number, latlng: [number, number]) {
  const config = MARKER_CONFIG[item._type] ?? MARKER_CONFIG.stop;
  const icon = L.divIcon({
    className: '', // drop leaflet's default white box
    html: `<span class="${config.classes}">${markerInner(item, config)}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
  const marker = L.marker(latlng, { icon, title: item.title ?? '' }).addTo(map);
  marker.on('click', () => openStop(index));
}

// Quadratic bezier a→b bulged perpendicular; offsetIndex 0 → straight line.
// Both branches return 25 samples so the t=0.5 apex sample (pts[12]) always exists.
function arcPoints(a: [number, number], b: [number, number], offsetIndex: number): [number, number][] {
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
  const pLat = -dLng / len;           // unit perpendicular (lat component)
  const pLng = dLat / len / cosLat;   // unit perpendicular (lng component, un-corrected)
  const bulge = Math.min(0.03, Math.max(0.0008, len * 0.18)) * offsetIndex;
  const cLat = midLat + pLat * bulge;
  const cLng = (lng1 + lng2) / 2 + pLng * bulge;
  const pts: [number, number][] = [];
  for (let s = 0; s <= 24; s++) {
    const t = s / 24, u = 1 - t;
    pts.push([u * u * lat1 + 2 * u * t * cLat + t * t * lat2, u * u * lng1 + 2 * u * t * cLng + t * t * lng2]);
  }
  return pts;
}

function drawSegment(map: L.Map, from: Located, to: Located, travels: { item: MapStopItem; index: number }[]) {
  if (travels.length === 0) {
    // Adjacent located stops with no travel doc — subtle non-clickable connector.
    L.polyline([from.latlng, to.latlng], {
      color: SEA_300, weight: 2.5, dashArray: '5 7', opacity: 0.8,
      lineCap: 'round', interactive: false,
    }).addTo(map);
    return;
  }
  const n = travels.length;
  travels.forEach((t, k) => {
    const offsetIndex = k + 1 - (n + 1) / 2; // 0 for single leg; ±0.5, ±1, ±1.5 … fan out
    const pts = arcPoints(from.latlng, to.latlng, offsetIndex);
    const line = L.polyline(pts, { color: SEA_500, weight: 4, opacity: 0.85, lineCap: 'round' }).addTo(map);
    line.on('click', () => openStop(t.index));
    line.on('mouseover', () => { line.setStyle({ weight: 6, opacity: 1 }); map.getContainer().style.cursor = 'pointer'; });
    line.on('mouseout',  () => { line.setStyle({ weight: 4, opacity: 0.85 }); map.getContainer().style.cursor = ''; });
    // Apex icon (t = 0.5 sample) — secondary click target + leg identity.
    const apex = L.divIcon({
      className: '',
      html: `<span class="${TRAVEL_ICON_CLASSES}">${t.item.icon ?? '→'}</span>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    const m = L.marker(pts[12], { icon: apex, title: t.item.title ?? 'Travel' }).addTo(map);
    m.on('click', () => openStop(t.index));
  });
}

/** Renders every feature of a stop; shapes/dots open that stop's modal. */
function addStopFeatures(map: L.Map, item: MapStopItem, index: number) {
  (item.features ?? []).forEach((f) => {
    const layer = featureLayer(f);
    if (!layer) return;
    layer.addTo(map);
    layer.on('click', () => openStop(index));
  });
}

/**
 * Builds the itinerary route map into `container`. Returns a cleanup function,
 * or null when there is nothing to draw (no anchors and no features).
 */
export function createItineraryMap(container: HTMLElement, stops: MapStopItem[]): (() => void) | null {
  const points: [number, number][] = [];
  const featureCorners: [number, number][] = [];
  stops.forEach((s) => {
    if (s?.location && Number.isFinite(s.location.lat) && Number.isFinite(s.location.lng)) {
      points.push([s.location.lat, s.location.lng]);
    }
    if (s?._type === 'travel') return;
    (s?.features ?? []).forEach((f) => {
      const b = featureBounds(f);
      if (!b) return;
      featureCorners.push([b.getSouthWest().lat, b.getSouthWest().lng]);
      featureCorners.push([b.getNorthEast().lat, b.getNorthEast().lng]);
    });
  });
  if (points.length === 0 && featureCorners.length === 0) return null;

  const map = L.map(container, {
    scrollWheelZoom: false,                    // page scroll passes over the map
    renderer: L.canvas({ tolerance: 20 }),     // ~20px click tolerance around thin arcs
  });
  // Mirrors studio/components/leaflet/leafletConfig.ts TILE_URL/TILE_OPTIONS —
  // keep both in sync when changing tiles, zoom or attribution.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  // Walk the ordered array: located items become markers and close segments;
  // travel items accumulate into the segment between their neighbors. Features
  // render before the unpinned-stop skip, so shape-only stops still draw.
  let lastLocated: Located | null = null;
  let pendingTravels: { item: MapStopItem; index: number }[] = [];
  stops.forEach((s, i) => {
    if (s?._type === 'travel') {
      pendingTravels.push({ item: s, index: i });
      return;
    }
    addStopFeatures(map, s, i);
    if (!(s?.location && Number.isFinite(s.location.lat) && Number.isFinite(s.location.lng))) return; // unpinned stop: no marker/segment, does not break the chain
    const latlng: [number, number] = [s.location.lat, s.location.lng];
    if (lastLocated) {
      drawSegment(map, lastLocated, { latlng, index: i }, pendingTravels);
    }
    pendingTravels = [];
    addStopMarker(map, s, i, latlng);
    lastLocated = { latlng, index: i };
  });
  // Travels before the first located point or after the last: intentionally not drawn.
  const all = [...points, ...featureCorners];
  if (all.length > 1) map.fitBounds(all, { padding: [40, 40], maxZoom: 16 });
  else map.setView(all[0], 15);

  return () => map.remove();
}
