import L from 'leaflet';
import 'leaflet/dist/leaflet.css'; // the package owns its CSS
import { arcPoints, type MapFeature } from '@adayin/map-core/core';
import {
  featureBounds,
  featureLayer,
  flashPin,
  tooltipText,
  type FeatureStyle,
  type PinFlashOptions,
} from '@adayin/map-core/render';
import { addTileLayer } from '@adayin/map-core/tiles';
import { STOP_OPEN_EVENT } from './mapEvents';
import { stopGlyph } from './stopGlyph';
import { stopNumbers } from './stops';

export interface MapStopItem {
  _type: string;
  title: string | null;
  location: { lat: number; lng: number } | null;
  /** Travel-leg icon (`travelType.icon.svg`); null for every other item. */
  icon: string | null;
  features: MapFeature[] | null;
}

// Full literal class strings (Tailwind v4 scans this file's text). `palette`
// marks the pins that prepend a per-stop colour (see STOP_CLASSES); S/E pins
// carry their own theme bg.
const MARKER_CONFIG: Record<string, { classes: string; palette: boolean }> = {
  stop:          { classes: 'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white ring-[3px] ring-white shadow-md', palette: true },
  startLocation: { classes: 'flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-[11px] font-bold text-white ring-[3px] ring-white shadow-md', palette: false },
  endLocation:   { classes: 'flex h-7 w-7 items-center justify-center rounded-full bg-sand-500 text-[11px] font-bold text-white ring-[3px] ring-white shadow-md',  palette: false },
};
// Glyph boxes, same 20px dot as the rail: travel legs get the rail's 12px box
// so the icon draws at one scale on both surfaces.
const TRAVEL_ICON_CLASSES =
  'flex h-5 w-5 items-center justify-center rounded-full bg-sea-400 text-white ring-2 ring-white shadow';
const PIN_GLYPH_CLASSES = 'h-3.5 w-3.5';
const TRAVEL_GLYPH_CLASSES = 'h-3 w-3';

// Theme colors, inlined — Leaflet's canvas renderer can't resolve CSS vars, so
// these mirror the ramps in global.css (grep the token names on change).
const SEA_500 = 'oklch(0.53 0.085 185)'; // --color-sea-500
const SEA_300 = 'oklch(0.74 0.065 185)'; // --color-sea-300

// Shared base style for stop features; `color` is overridden per stop by the
// caller so overlapping regions stay attributable.
const WEB_FEATURE_STYLE: FeatureStyle = {
  color: SEA_500,
  weight: 3,
  opacity: 0.8,
  fillOpacity: 0.12,
  lineCap: 'round',
};

// Zoom ceiling for framing the whole route and for a "Show on Map" flight:
// street-level readable, neighbourhood still in frame.
const VIEW_MAX_ZOOM = 16;

// The focused pin's blink (flashPin): web's own tuning for the "Show on Map"
// flight, kept here so it reads next to focus() rather than in the shared kit.
const PIN_FLASH: PinFlashOptions = {
  enabled: true,
  blinks: 5,
  halfPeriodMs: 180,
  minOpacity: 0.1,
  startDelay: 250,
};

// Per-stop palette — the `--color-stop-*` hues from global.css, ordered so
// consecutive stops are far apart on the wheel (adjacent stops ≥0.18 ΔE, any
// pair ≥0.14), since adjacent stops are the ones whose regions overlap.
// Literal class strings: Tailwind v4 scans this file's text, and emitting each
// class also forces its theme var into the stylesheet for the canvas layers.
const STOP_CLASSES = [
  'bg-stop-sea', 'bg-stop-berry', 'bg-stop-ocean',
  'bg-stop-kelp', 'bg-stop-violet', 'bg-stop-amber',
];

/** Resolves the pin classes above to the canvas color strings Leaflet needs. */
function stopPalette(): string[] {
  const styles = getComputedStyle(document.documentElement);
  return STOP_CLASSES.map(
    (cls) => styles.getPropertyValue(`--color-${cls.slice('bg-'.length)}`).trim() || SEA_500,
  );
}

type Located = { latlng: [number, number]; index: number; color: string };

// Step hover emphasis: how far a step fades while another step is hovered —
// low enough that overlapping regions and pins resolve to the hovered one,
// high enough that the rest of the route stays readable.
const DIM_FACTOR = 0.35;

/** Applies the dim/restore state of one layer (see `layerFade`). */
type Fade = (dimmed: boolean) => void;

function openStop(index: number) {
  window.dispatchEvent(new CustomEvent(STOP_OPEN_EVENT, { detail: index }));
}

/**
 * Hover label for a map marker, styled in ItineraryMap.svelte. Leaflet's
 * `title` option only paints the browser's own delayed, unstyleable tooltip.
 * The icon is the tabbable `role="button"` for the marker, so the same text
 * becomes its accessible name — taken from the `add` event because markers
 * created before the map has a view attach only once the map is loaded.
 */
function labelMarker(marker: L.Marker, label: string | null) {
  const text = label?.trim();
  if (!text) return;
  marker.bindTooltip(tooltipText(text), {
    direction: 'top',
    offset: [0, -16],
    opacity: 1,
    className: 'itinerary-tooltip',
  });
  marker.on('add', () => marker.getElement()?.setAttribute('aria-label', text));
}

function addStopMarker(map: L.Map, item: MapStopItem, index: number, latlng: [number, number], pinClass: string, number: number | null): L.Marker {
  const config = MARKER_CONFIG[item._type] ?? MARKER_CONFIG.stop;
  // S/E pins carry their own theme bg; stop pins prepend the palette class.
  const classes = config.palette ? `${pinClass} ${config.classes}` : config.classes;
  // Real stops show their 1..n number — the same count the metabar and index
  // cards show (see stops.ts); S/E keep their letter and unknown types fall
  // back to the pin glyph.
  const content = number ?? stopGlyph({ type: item._type, icon: item.icon }, PIN_GLYPH_CLASSES);
  const icon = L.divIcon({
    className: '', // drop leaflet's default white box
    html: `<span class="${classes}">${content}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
  const marker = L.marker(latlng, { icon }).addTo(map);
  labelMarker(marker, item.title);
  marker.on('click', () => openStop(index));
  return marker;
}

/** Draws the travel legs between two located stops in `from`'s colour.
 * Returns each step's layers (arc and apex icon) tagged with the travel
 * item's index, for hover wiring. */
function drawSegment(
  map: L.Map,
  from: Located,
  to: Located,
  travels: { item: MapStopItem; index: number }[],
): { index: number; layer: L.Layer }[] {
  if (travels.length === 0) {
    // Adjacent located stops with no travel doc — subtle non-clickable connector.
    L.polyline([from.latlng, to.latlng], {
      color: SEA_300, weight: 2.5, dashArray: '5 7', opacity: 0.8,
      lineCap: 'round', interactive: false,
    }).addTo(map);
    return [];
  }
  const n = travels.length;
  const drawn: { index: number; layer: L.Layer }[] = [];
  travels.forEach((t, k) => {
    const offsetIndex = k + 1 - (n + 1) / 2; // 0 for single leg; ±0.5, ±1, ±1.5 … fan out
    const pts = arcPoints(from.latlng, to.latlng, offsetIndex);
    const line = L.polyline(pts, { color: from.color, weight: 4, opacity: 0.85, lineCap: 'round' }).addTo(map);
    line.on('click', () => openStop(t.index));
    // Opacity belongs to the hover emphasis: the leg keeps its authored 0.85
    // while its own step is hovered, so hover only thickens the stroke.
    line.on('mouseover', () => { line.setStyle({ weight: 6 }); map.getContainer().style.cursor = 'pointer'; });
    line.on('mouseout',  () => { line.setStyle({ weight: 4 }); map.getContainer().style.cursor = ''; });
    // Apex icon (t = 0.5 sample) — secondary click target + leg identity.
    const apex = L.divIcon({
      className: '',
      html: `<span class="${TRAVEL_ICON_CLASSES}">${stopGlyph({ type: 'travel', icon: t.item.icon }, TRAVEL_GLYPH_CLASSES)}</span>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    const m = L.marker(pts[12], { icon: apex }).addTo(map);
    labelMarker(m, t.item.title ?? 'Travel');
    m.on('click', () => openStop(t.index));
    drawn.push({ index: t.index, layer: line }, { index: t.index, layer: m });
  });
  return drawn;
}

/** Renders every feature of a stop; shapes/dots open that stop's modal.
 * Returns the layers so the caller can wire them into hover emphasis. */
function addStopFeatures(map: L.Map, item: MapStopItem, index: number, color: string): L.Layer[] {
  return (item.features ?? []).flatMap((f): L.Layer[] => {
    const layer = featureLayer(f, { style: { ...WEB_FEATURE_STYLE, color }, pointColor: color, pointSize: 12 });
    if (!layer) return [];
    layer.addTo(map);
    layer.on('click', () => openStop(index));
    return [layer];
  });
}

/**
 * Dim/restore state for a created step layer: paths (regions, travel arcs)
 * fade stroke and fill from their authored opacities; markers (pins, points,
 * text, travel apex icons) fade their icon. Anything else stays put.
 */
function layerFade(layer: L.Layer): Fade {
  if (layer instanceof L.Path) {
    const { opacity = 1, fillOpacity = 0 } = layer.options;
    return (dimmed) =>
      layer.setStyle({
        opacity: dimmed ? opacity * DIM_FACTOR : opacity,
        fillOpacity: dimmed ? fillOpacity * DIM_FACTOR : fillOpacity,
      });
  }
  if (layer instanceof L.Marker) {
    return (dimmed) => layer.setOpacity(dimmed ? DIM_FACTOR : 1);
  }
  return () => {};
}

/**
 * Hover emphasis shared by every step's layers — stop pins and regions, travel
 * arcs and their apex icons. Registering a layer wires its hover: while any
 * layer of step `i` is hovered, `i` keeps its authored opacity and every other
 * step fades, so overlapping regions and crossings read as the step under the
 * cursor. `keep` names further steps that stay lit alongside the hovered one —
 * travel legs pass their endpoint stops, so a hovered path leaves only itself
 * and its from/to stops readable.
 */
function stepEmphasis() {
  const steps = new Map<number, { fades: Fade[]; keep: readonly number[] }>();
  let hovered: number | null = null;

  const setHovered = (next: number | null) => {
    if (next === hovered) return;
    hovered = next;
    const keep = next === null ? undefined : steps.get(next)?.keep;
    steps.forEach(({ fades }, step) => {
      const dimmed = next !== null && step !== next && !keep?.includes(step);
      fades.forEach((fade) => fade(dimmed));
    });
  };

  return (index: number, layer: L.Layer, fade: Fade, keep: readonly number[] = []) => {
    const entry = steps.get(index);
    if (entry) entry.fades.push(fade);
    else steps.set(index, { fades: [fade], keep });
    layer.on('mouseover', () => setHovered(index));
    layer.on('mouseout', () => setHovered(null));
  };
}

/**
 * Builds the itinerary route map into `container`. Returns the Leaflet map
 * (for resize handling), a destroy function, and focus(index) — the stop
 * list's "Show on Map" entry point — or null when there is nothing to draw
 * (no anchors and no features).
 */
export function createItineraryMap(container: HTMLElement, stops: MapStopItem[]): { map: L.Map; destroy: () => void; focus: (index: number) => void } | null {
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
  addTileLayer(map);

  // Walk the ordered array: located items become markers and close segments;
  // travel items accumulate into the segment between their neighbors. Features
  // render before the unpinned-stop skip, so shape-only stops still draw.
  let lastLocated: Located | null = null;
  let pendingTravels: { item: MapStopItem; index: number }[] = [];
  // Palette slot per stop (travel legs don't consume one), assigned in the
  // alternating-contrast order of STOP_CLASSES.
  const palette = stopPalette();
  // Stop number per array slot — the metabar/cards' count (see stops.ts).
  const numbers = stopNumbers(stops);
  // Marker per array index, for the stop list's "Show on Map" flight (blink target).
  const pins = new Map<number, L.Marker>();
  // Hover wiring for every step layer created below (see stepEmphasis).
  const trackStepLayer = stepEmphasis();
  let stopOrdinal = 0;
  stops.forEach((s, i) => {
    if (s?._type === 'travel') {
      pendingTravels.push({ item: s, index: i });
      return;
    }
    const slot = stopOrdinal++ % STOP_CLASSES.length;
    const color = palette[slot];
    const features = addStopFeatures(map, s, i, color);
    features.forEach((layer) => trackStepLayer(i, layer, layerFade(layer)));
    if (!(s?.location && Number.isFinite(s.location.lat) && Number.isFinite(s.location.lng))) return; // unpinned stop: no marker/segment, does not break the chain
    const latlng: [number, number] = [s.location.lat, s.location.lng];
    if (lastLocated) {
      const legs = drawSegment(map, lastLocated, { latlng, index: i, color }, pendingTravels);
      // Hovering a leg keeps its endpoints lit: from (lastLocated) and to (i).
      const keep = [lastLocated.index, i];
      legs.forEach(({ index, layer }) => trackStepLayer(index, layer, layerFade(layer), keep));
    }
    pendingTravels = [];
    const marker = addStopMarker(map, s, i, latlng, STOP_CLASSES[slot], numbers[i]);
    pins.set(i, marker);
    trackStepLayer(i, marker, layerFade(marker));
    lastLocated = { latlng, index: i, color };
  });
  // Travels before the first located point or after the last: intentionally not drawn.
  const all = [...points, ...featureCorners];
  if (all.length > 1) map.fitBounds(all, { padding: [40, 40], maxZoom: VIEW_MAX_ZOOM });
  else map.setView(all[0], 15);

  // Latest focus wins: only the most recent click may trigger the blink.
  let focusSeq = 0;
  /**
   * Flies to one stop's drawn geometry (pin and/or features) and blinks its
   * pin — the stop list's "Show on Map". Scrolls the map into view first (the
   * list sits below it) and holds the blink until the flight has landed with
   * the map in frame, so scrolling up from the bottom still catches it.
   */
  function focus(index: number) {
    const item = stops[index];
    if (!item) return;
    const bounds = L.latLngBounds([]);
    const { lat, lng } = item.location ?? {};
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) bounds.extend([lat, lng]);
    (item.features ?? []).forEach((f) => {
      const b = featureBounds(f);
      if (b) bounds.extend(b);
    });
    if (!bounds.isValid()) return; // nothing drawn for this item
    map.getContainer().scrollIntoView({ behavior: 'smooth', block: 'center' });
    // The blink waits for the flight to land AND the map to be on screen —
    // from deep in the stop list the smooth scroll is still running when
    // moveend fires, and a blink nobody sees is wasted. Same UX wherever the
    // click came from. Guard timeout so a missed event can't suppress it.
    const seq = ++focusSeq;
    const pin = pins.get(index)?.getElement() ?? null;
    const landed = new Promise<void>((resolve) => map.once('moveend', () => resolve()));
    const framed = new Promise<void>((resolve) => {
      const rect = map.getContainer().getBoundingClientRect();
      if (rect.top >= 0 && rect.bottom <= window.innerHeight) return resolve();
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.intersectionRatio >= 0.9)) return;
        io.disconnect();
        resolve();
      }, { threshold: 0.9 });
      io.observe(map.getContainer());
    });
    const guard = new Promise<void>((resolve) => setTimeout(resolve, 3500));
    Promise.race([Promise.all([landed, framed]), guard]).then(() => {
      if (seq === focusSeq) flashPin(pin, PIN_FLASH);
    });
    map.flyToBounds(bounds, { padding: [40, 40], maxZoom: VIEW_MAX_ZOOM });
  }

  return { map, destroy: () => map.remove(), focus };
}
