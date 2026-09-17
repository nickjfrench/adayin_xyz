import {
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  type ExpressionSpecification,
  type FilterSpecification,
  type MapMouseEvent,
} from 'maplibre-gl';
import type { Feature, FeatureCollection } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css'; // the package owns its CSS
import { configureMapLibreWorkers, OPENFREEMAP_STYLE_URL } from '@adayin/map-core/basemap';
import { arcPoints, mapFeatureBounds, type MapFeature } from '@adayin/map-core/core';
import { mapFeatureToGeoJSON } from '@adayin/map-core/geojson';
import {
  flashPin,
  textLabelElement,
  tooltipText,
  type PinFlashOptions,
} from '@adayin/map-core/dom';
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
  stop: {
    classes:
      'flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white ring-[3px] ring-white shadow-md',
    palette: true,
  },
  startLocation: {
    classes:
      'flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-[11px] font-bold text-white ring-[3px] ring-white shadow-md',
    palette: false,
  },
  endLocation: {
    classes:
      'flex h-7 w-7 items-center justify-center rounded-full bg-sand-500 text-[11px] font-bold text-white ring-[3px] ring-white shadow-md',
    palette: false,
  },
};
// Glyph boxes, same 20px dot as the rail: travel legs get the rail's 12px box
// so the icon draws at one scale on both surfaces.
const TRAVEL_ICON_CLASSES =
  'flex h-5 w-5 items-center justify-center rounded-full bg-sea-400 text-white ring-2 ring-white shadow';
const PIN_GLYPH_CLASSES = 'h-3.5 w-3.5';
const TRAVEL_GLYPH_CLASSES = 'h-3 w-3';

/**
 * MapLibre's style spec predates CSS Color 4: it parses hex, rgb()/hsl() and
 * named colors, and an unparsable paint value silently falls back to the
 * property default (black regions instead of the per-stop palette). The site's
 * tokens are oklch, so convert them here; a value already in a supported
 * format passes through untouched.
 */
function mapColor(cssColor: string): string {
  const match = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*(?:deg)?\s*\)$/i.exec(
    cssColor.trim(),
  );
  if (!match) return cssColor;
  const lightness = Number(match[1]) / (match[2] ? 100 : 1);
  const hue = (Number(match[4]) * Math.PI) / 180;
  const a = Number(match[3]) * Math.cos(hue);
  const b = Number(match[3]) * Math.sin(hue);
  // OKLCH → OKLab → linear sRGB → sRGB, per the CSS Color 4 conversion code.
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const encode = (value: number) => {
    const clamped = Math.min(1, Math.max(0, value));
    return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
  };
  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((value) => Math.round(encode(value) * 255));
  return `rgb(${channels.join(', ')})`;
}

// Theme colors, inlined — MapLibre paint values can't resolve CSS vars, so
// these mirror the ramps in global.css (grep the token names on change).
const SEA_500 = mapColor('oklch(0.53 0.085 185)'); // --color-sea-500
const SEA_300 = mapColor('oklch(0.74 0.065 185)'); // --color-sea-300

// Feature look, authored here so the paint expressions below read in one
// place: 0.8 stroke / 0.12 fill for regions, a 12px amber-equivalent dot
// (7px radius + a 2px white ring) for points.
const FEATURE_LINE_WIDTH = 3;
const FEATURE_LINE_OPACITY = 0.8;
const FEATURE_FILL_OPACITY = 0.12;
const FEATURE_POINT_RADIUS = 7;
const FEATURE_POINT_RING = 2;
const LEG_WIDTH = 4;
const LEG_HOVER_WIDTH = 6;
const LEG_OPACITY = 0.85;

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
// class also forces its theme var into the stylesheet for the paint values.
const STOP_CLASSES = [
  'bg-stop-sea',
  'bg-stop-berry',
  'bg-stop-ocean',
  'bg-stop-kelp',
  'bg-stop-violet',
  'bg-stop-amber',
];

/** Resolves the pin classes above to the color strings MapLibre needs. */
function stopPalette(): string[] {
  const styles = getComputedStyle(document.documentElement);
  return STOP_CLASSES.map((cls) =>
    mapColor(styles.getPropertyValue(`--color-${cls.slice('bg-'.length)}`).trim() || SEA_500),
  );
}

/** [lat, lng] — the arcPoints and stop-glyph convention, not GeoJSON's. */
type LatLng = [number, number];
type Located = { latLng: LatLng; index: number; color: string };

// Step hover emphasis: how far a step fades while another step is hovered —
// low enough that overlapping regions and pins resolve to the hovered one,
// high enough that the rest of the route stays readable.
const DIM_FACTOR = 0.35;

const FEATURE_SOURCE = 'itinerary-features';
const LEG_SOURCE = 'itinerary-legs';
const LAYER_LEG = 'itinerary-leg';
const LAYER_GAP = 'itinerary-gap';
const LAYER_REGION = 'itinerary-region';
const LAYER_REGION_EDGE = 'itinerary-region-edge';
const LAYER_POINT = 'itinerary-point';

const POINT_FILTER: FilterSpecification = ['==', ['get', 'shape'], 'marker'];
const REGION_FILTER: FilterSpecification = [
  'in',
  ['get', 'shape'],
  ['literal', ['polygon', 'circle']],
];

function openStop(index: number) {
  window.dispatchEvent(new CustomEvent(STOP_OPEN_EVENT, { detail: index }));
}

/** Data-driven dim state: authored opacity while lit, a fraction while not. */
function dimmed(value: number, dimmedValue: number): ExpressionSpecification {
  return ['case', ['boolean', ['feature-state', 'dimmed'], false], dimmedValue, value];
}

/**
 * Builds a marker element that is also its own button: same classes and glyph
 * markup the rail timeline uses, `role`/`tabindex` so the pin is reachable, and
 * the item's title as the accessible name.
 */
function markerElement(
  className: string,
  content: string,
  label: string | null | undefined,
): HTMLElement {
  const el = document.createElement('span');
  el.className = className;
  el.innerHTML = content;
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  // MapLibre appends markers to a container whose cursor is `grab`; these are
  // buttons, not map-drag handles, so restore the click affordance Leaflet's
  // interactive markers carried.
  el.style.cursor = 'pointer';
  const text = label?.trim();
  if (text) el.setAttribute('aria-label', text);
  return el;
}
/**
 * Builds the itinerary route map into `container`. Returns the MapLibre map
 * (for resize handling), a destroy function, and focus(index) — the stop
 * list's "Show on Map" entry point — or null when there is nothing to draw
 * (no anchors and no features).
 */
export function createItineraryMap(
  container: HTMLElement,
  stops: MapStopItem[],
): {
  map: MapLibreMap;
  destroy: () => void;
  focus: (index: number) => void;
} | null {
  const anchors: [number, number][] = [];
  const featureCorners: [number, number][] = [];
  stops.forEach((s) => {
    if (s?.location && Number.isFinite(s.location.lat) && Number.isFinite(s.location.lng)) {
      anchors.push([s.location.lng, s.location.lat]);
    }
    if (s?._type === 'travel') return;
    (s?.features ?? []).forEach((f) => {
      const b = mapFeatureBounds(f);
      if (!b) return;
      featureCorners.push([b.west, b.south], [b.east, b.north]);
    });
  });
  if (anchors.length === 0 && featureCorners.length === 0) return null;

  configureMapLibreWorkers();
  // Attribution stays on: the OpenFreeMap style's own OpenFreeMap / OpenMapTiles
  // / OpenStreetMap credit renders through MapLibre's AttributionControl.
  // The fitted camera is applied in the constructor (bounds + fitBoundsOptions
  // is instant there), so the first painted frame is already framed around
  // every stop and feature — no zoom-in swoosh on load.
  const all = [...anchors, ...featureCorners];
  const map = new MapLibreMap({
    container,
    style: OPENFREEMAP_STYLE_URL,
    ...(all.length > 1
      ? {
          bounds: boundAround(all),
          fitBoundsOptions: { padding: 40, maxZoom: VIEW_MAX_ZOOM },
        }
      : { center: all[0], zoom: 15 }), // one point: street-level on it
    scrollZoom: false, // page scroll passes over the map
    clickTolerance: 20, // ~20px hit slop around thin arcs
    maxZoom: 20,
  });
  try {
    map.addControl(new NavigationControl({ showCompass: false, showZoom: true }), 'top-right');

    // One popup, moved and re-filled as the pointer travels: the hover label for
    // a marker or a rendered feature (see the layer handlers below).
    const tooltip = new Popup({
      anchor: 'bottom',
      offset: 16, // clears the pin
      maxWidth: '16rem', // the tooltip box's authored width
      closeButton: false,
      closeOnClick: false,
      className: 'itinerary-tooltip',
    });
    // Rebuilt only when the label changes: mousemove fires per frame, and
    // setDOMContent + addTo would detach and re-append the popup every time. The
    // isOpen() check keeps the fast path off a popup that something else removed.
    let tooltipLabel: string | null = null;
    const showTooltip = (label: string | null | undefined, lngLat: [number, number]) => {
      const text = label?.trim();
      if (!text) return;
      if (text === tooltipLabel && tooltip.isOpen()) {
        tooltip.setLngLat(lngLat);
        return;
      }
      tooltipLabel = text;
      tooltip.setLngLat(lngLat).setDOMContent(tooltipText(text)).addTo(map);
    };

    // Per-step hover bookkeeping: every marker and rendered feature a step owns
    // dims together, and `keep` names further steps that stay lit (a leg's
    // endpoints while the leg itself is hovered).
    type StepLayers = {
      markers: HTMLElement[];
      featureIds: number[];
      legIds: number[];
      keep: number[];
    };
    const steps = new Map<number, StepLayers>();
    const stepLayers = (step: number): StepLayers => {
      let entry = steps.get(step);
      if (!entry) {
        entry = { markers: [], featureIds: [], legIds: [], keep: [] };
        steps.set(step, entry);
      }
      return entry;
    };
    // Feature-state writes need the sources addFeatureLayers creates, but hover
    // can reach here while the basemap style is still loading (the island
    // prefetches 800px ahead), where setFeatureState throws. Skip the GL state
    // and let the next enter/leave cycle apply it; the DOM marker dimming above
    // is unaffected.
    let featureSourcesReady = false;
    const setDimmed = (source: string, ids: number[], dimmedFlag: boolean) => {
      if (!featureSourcesReady) return;
      ids.forEach((id) => map.setFeatureState({ source, id }, { dimmed: dimmedFlag }));
    };
    let hovered: number | null = null;
    const setHovered = (next: number | null) => {
      if (next === hovered) return;
      hovered = next;
      const keep = next === null ? [] : (steps.get(next)?.keep ?? []);
      steps.forEach((entry, step) => {
        const dim = next !== null && step !== next && !keep.includes(step);
        entry.markers.forEach((el) => {
          el.style.opacity = dim ? String(DIM_FACTOR) : '';
        });
        setDimmed(FEATURE_SOURCE, entry.featureIds, dim);
        setDimmed(LEG_SOURCE, entry.legIds, dim);
      });
    };

    // Feature ids are integers: MapLibre resolves feature-state through the tile's
    // numeric id, so the authored "3:1"-style strings never matched the state.
    let nextId = 1;

    const featureCollection: FeatureCollection = {
      type: 'FeatureCollection',
      features: [] as Feature[],
    };
    const legCollection: FeatureCollection = {
      type: 'FeatureCollection',
      features: [] as Feature[],
    };

    /** Registers a DOM marker: hover emphasis, its label, and its activation action. */
    const addMarker = (
      element: HTMLElement,
      latLng: LatLng,
      step: number,
      label: string | null,
      onClick: () => void,
    ) => {
      element.addEventListener('click', onClick);
      // The pin is a span carrying role="button", so Enter and Space are the keys
      // the role promises — neither fires a click on a span, unlike a real button.
      element.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onClick();
      });
      element.addEventListener('mouseenter', () => {
        setHovered(step);
        showTooltip(label, [latLng[1], latLng[0]]);
      });
      element.addEventListener('mouseleave', () => {
        setHovered(null);
        tooltip.remove();
      });
      const marker = new Marker({ element, anchor: 'center' })
        .setLngLat([latLng[1], latLng[0]])
        .addTo(map);
      stepLayers(step).markers.push(element);
      return marker;
    };

    /** Draws the travel legs between two located stops in `from`'s colour. */
    const drawSegment = (
      from: Located,
      to: Located,
      travels: { item: MapStopItem; index: number }[],
    ) => {
      if (travels.length === 0) {
        // Adjacent located stops with no travel doc — subtle non-clickable connector.
        legCollection.features.push({
          type: 'Feature',
          id: nextId++,
          properties: { dashed: true },
          geometry: {
            type: 'LineString',
            coordinates: [flip(from.latLng), flip(to.latLng)],
          },
        });
        return;
      }
      const n = travels.length;
      travels.forEach((travel, k) => {
        const offsetIndex = k + 1 - (n + 1) / 2; // 0 for single leg; ±0.5, ±1, ±1.5 … fan out
        const samples = arcPoints(from.latLng, to.latLng, offsetIndex);
        const id = nextId++;
        legCollection.features.push({
          type: 'Feature',
          id,
          properties: {
            step: travel.index,
            color: from.color,
            label: travel.item.title ?? 'Travel',
          },
          geometry: { type: 'LineString', coordinates: samples.map(flip) },
        });
        const layers = stepLayers(travel.index);
        layers.legIds.push(id);
        // Hovering a leg keeps its endpoints lit: from (lastLocated) and to (i).
        layers.keep.push(from.index, to.index);
        // Apex icon (t = 0.5 sample) — secondary click target + leg identity.
        const apex = samples[12];
        const element = markerElement(
          TRAVEL_ICON_CLASSES,
          stopGlyph({ type: 'travel', icon: travel.item.icon }, TRAVEL_GLYPH_CLASSES),
          travel.item.title ?? 'Travel',
        );
        addMarker(element, apex, travel.index, travel.item.title ?? 'Travel', () =>
          openStop(travel.index),
        );
      });
    };

    /** Renders every feature of a stop; shapes/dots and labels open that stop. */
    const addStopFeatures = (item: MapStopItem, step: number, color: string) => {
      (item.features ?? []).forEach((feature) => {
        // Text labels stay a white pill — DOM, so the site's typography applies, and
        // the pill already shows the text: no hover tooltip.
        if (feature.shape === 'text' && feature.label && feature.position) {
          const element = textLabelElement(feature.label);
          element.setAttribute('role', 'button');
          element.setAttribute('tabindex', '0');
          element.setAttribute('aria-label', feature.label);
          addMarker(element, [feature.position.lat, feature.position.lng], step, null, () =>
            openStop(step),
          );
          return;
        }
        const id = nextId++;
        const rendered = mapFeatureToGeoJSON(feature, id, color);
        if (!rendered) return;
        featureCollection.features.push({
          ...rendered,
          properties: { ...rendered.properties, step },
        });
        stepLayers(step).featureIds.push(id);
      });
    };

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
    const pins = new Map<number, Marker>();
    let stopOrdinal = 0;
    stops.forEach((s, i) => {
      if (s?._type === 'travel') {
        pendingTravels.push({ item: s, index: i });
        return;
      }
      const slot = stopOrdinal++ % STOP_CLASSES.length;
      const color = palette[slot];
      addStopFeatures(s, i, color);
      if (!(s?.location && Number.isFinite(s.location.lat) && Number.isFinite(s.location.lng)))
        return; // unpinned stop: no marker/segment, does not break the chain
      const latLng: LatLng = [s.location.lat, s.location.lng];
      if (lastLocated) drawSegment(lastLocated, { latLng, index: i, color }, pendingTravels);
      pendingTravels = [];
      const config = MARKER_CONFIG[s._type] ?? MARKER_CONFIG.stop;
      // S/E pins carry their own theme bg; stop pins prepend the palette class.
      const classes = config.palette ? `${STOP_CLASSES[slot]} ${config.classes}` : config.classes;
      // Real stops show their 1..n number — the same count the metabar and index
      // cards show (see stops.ts); S/E keep their letter and unknown types fall
      // back to the pin glyph.
      const content = numbers[i] ?? stopGlyph({ type: s._type, icon: s.icon }, PIN_GLYPH_CLASSES);
      const marker = addMarker(
        markerElement(classes, String(content), s.title),
        latLng,
        i,
        s.title,
        () => openStop(i),
      );
      pins.set(i, marker);
      lastLocated = { latLng, index: i, color };
    });
    // Travels before the first located point or after the last: intentionally not drawn.

    // Feature sources can't exist until the basemap style loads — addSource and
    // setFeatureState throw "Style is not done loading" before that, and the
    // OpenFreeMap style arrives over the network. Markers and the initial view
    // don't wait on it.
    const addFeatureLayers = () => {
      map.addSource(FEATURE_SOURCE, { type: 'geojson', data: featureCollection });
      map.addSource(LEG_SOURCE, { type: 'geojson', data: legCollection });
      featureSourcesReady = true;
      map.addLayer({
        id: LAYER_GAP,
        type: 'line',
        source: LEG_SOURCE,
        filter: ['==', ['get', 'dashed'], true],
        layout: { 'line-cap': 'round' },
        paint: {
          'line-color': SEA_300,
          'line-width': 2.5,
          'line-dasharray': [5, 7],
          'line-opacity': 0.8,
        },
      });
      map.addLayer({
        id: LAYER_LEG,
        type: 'line',
        source: LEG_SOURCE,
        filter: ['!=', ['get', 'dashed'], true],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          // Opacity belongs to the hover emphasis: the leg keeps its authored 0.85
          // while its own step is hovered, so hover only thickens the stroke.
          'line-opacity': dimmed(LEG_OPACITY, LEG_OPACITY * DIM_FACTOR),
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hovered'], false],
            LEG_HOVER_WIDTH,
            LEG_WIDTH,
          ],
        },
      });
      map.addLayer({
        id: LAYER_REGION,
        type: 'fill',
        source: FEATURE_SOURCE,
        filter: REGION_FILTER,
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': dimmed(FEATURE_FILL_OPACITY, FEATURE_FILL_OPACITY * DIM_FACTOR),
        },
      });
      map.addLayer({
        id: LAYER_REGION_EDGE,
        type: 'line',
        source: FEATURE_SOURCE,
        filter: REGION_FILTER,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': FEATURE_LINE_WIDTH,
          'line-opacity': dimmed(FEATURE_LINE_OPACITY, FEATURE_LINE_OPACITY * DIM_FACTOR),
        },
      });
      map.addLayer({
        id: LAYER_POINT,
        type: 'circle',
        source: FEATURE_SOURCE,
        filter: POINT_FILTER,
        paint: {
          'circle-radius': FEATURE_POINT_RADIUS,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': FEATURE_POINT_RING,
          'circle-opacity': dimmed(1, DIM_FACTOR),
          'circle-stroke-opacity': dimmed(1, DIM_FACTOR),
        },
      });

      // One hover owner for every interactive layer. MapLibre fires each layer's
      // delegated mouseenter/mouseleave on that layer's own transitions, so crossing
      // a dot or a leg inside a region leaves the region's hover dead until the
      // pointer exits it entirely (its query never emptied, so it never re-enters)
      // — and a marker under the pointer resolves the feature beneath it. Resolve
      // the topmost feature on every mousemove instead: the feature drawn last owns
      // the hover, a marker's own handlers own the pointer while it is hovered, and
      // nothing dead-ends.
      const INTERACTIVE_LAYERS = [LAYER_LEG, LAYER_REGION, LAYER_POINT];
      const legsHoverState = { id: null as number | null };
      const clearHover = () => {
        setHovered(null);
        tooltip.remove();
        map.getCanvas().style.cursor = '';
        if (legsHoverState.id != null) {
          map.setFeatureState({ source: LEG_SOURCE, id: legsHoverState.id }, { hovered: false });
          legsHoverState.id = null;
        }
      };
      map.on('mousemove', (e: MapMouseEvent) => {
        // A DOM marker under the pointer owns hover (its own listeners set it); the
        // GL query would resolve the feature beneath it and fight the marker.
        if (
          e.originalEvent.target instanceof Element &&
          e.originalEvent.target.closest('.maplibregl-marker')
        )
          return;
        const [hit] = map.queryRenderedFeatures(e.point, { layers: INTERACTIVE_LAYERS });
        if (!hit) return clearHover();
        map.getCanvas().style.cursor = 'pointer';
        setHovered(Number(hit.properties?.step ?? 0));
        const label = hit.properties?.label as string | undefined;
        // The tooltip follows the pointer: a hit carrying no label clears the last
        // one instead of leaving it stuck to the cursor.
        if (label?.trim()) showTooltip(label, [e.lngLat.lng, e.lngLat.lat]);
        else tooltip.remove();
        // The leg keeps its authored stroke while hovered; moving onto anything else
        // clears the previous leg's thickened state.
        if (hit.layer.id === LAYER_LEG && typeof hit.id === 'number') {
          if (legsHoverState.id !== hit.id) {
            if (legsHoverState.id != null)
              map.setFeatureState(
                { source: LEG_SOURCE, id: legsHoverState.id },
                { hovered: false },
              );
            legsHoverState.id = hit.id;
            map.setFeatureState({ source: LEG_SOURCE, id: hit.id }, { hovered: true });
          }
        } else if (legsHoverState.id != null) {
          map.setFeatureState({ source: LEG_SOURCE, id: legsHoverState.id }, { hovered: false });
          legsHoverState.id = null;
        }
      });
      map.on('mouseout', clearHover); // the pointer left the canvas entirely
      map.on('click', (e: MapMouseEvent) => {
        if (
          e.originalEvent.target instanceof Element &&
          e.originalEvent.target.closest('.maplibregl-marker')
        )
          return;
        const [hit] = map.queryRenderedFeatures(e.point, { layers: INTERACTIVE_LAYERS });
        if (hit) openStop(Number(hit.properties?.step ?? 0));
      });
    };
    if (map.isStyleLoaded()) addFeatureLayers();
    else map.on('style.load', addFeatureLayers);

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
      const corners: [number, number][] = [];
      const { lat, lng } = item.location ?? {};
      if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng))
        corners.push([lng, lat]);
      (item.features ?? []).forEach((f) => {
        const b = mapFeatureBounds(f);
        if (b) corners.push([b.west, b.south], [b.east, b.north]);
      });
      if (corners.length === 0) return; // nothing drawn for this item
      map.getContainer().scrollIntoView({ behavior: 'smooth', block: 'center' });
      // The blink waits for the flight to land AND the map to be on screen —
      // from deep in the stop list the smooth scroll is still running when
      // moveend fires, and a blink nobody sees is wasted. Same UX wherever the
      // click came from. Guard timeout so a missed event can't suppress it.
      const seq = ++focusSeq;
      const pin = pins.get(index)?.getElement() ?? null;
      // A named handler rather than once(): the registration has to come off
      // whichever way the race ends, and `once` self-removes only when moveend
      // actually fires — a focus whose flight never lands would leave it behind.
      let land: (() => void) | null = null;
      const landed = new Promise<void>((resolve) => {
        land = resolve;
      });
      const onMoveEnd = () => land?.();
      map.on('moveend', onMoveEnd);
      // Only created when the map is still off screen, and torn down by whichever
      // path ends the race: the 3500 ms guard can win with the map never framing,
      // and an observer left watching a page-lifetime container accumulates one
      // callback registration per "Show on Map" click.
      let watcher: IntersectionObserver | null = null;
      const framed = new Promise<void>((resolve) => {
        const rect = map.getContainer().getBoundingClientRect();
        if (rect.top >= 0 && rect.bottom <= window.innerHeight) return resolve();
        watcher = new IntersectionObserver(
          (entries) => {
            if (!entries.some((e) => e.intersectionRatio >= 0.9)) return;
            resolve();
          },
          { threshold: 0.9 },
        );
        watcher.observe(map.getContainer());
      });
      let guardTimer: ReturnType<typeof setTimeout> | undefined;
      const guard = new Promise<void>((resolve) => {
        guardTimer = setTimeout(resolve, 3500);
      });
      Promise.race([Promise.all([landed, framed]), guard]).then(() => {
        // Both outlive the race on the path that settles it first: the guard timer
        // runs to 3500 ms either way, and the moveend listener has no other owner.
        clearTimeout(guardTimer);
        map.off('moveend', onMoveEnd);
        watcher?.disconnect();
        if (seq === focusSeq) flashPin(pin, PIN_FLASH);
      });
      if (corners.length > 1)
        map.fitBounds(boundAround(corners), {
          padding: 40,
          maxZoom: VIEW_MAX_ZOOM,
          linear: false,
        });
      else map.flyTo({ center: corners[0], zoom: VIEW_MAX_ZOOM });
    }

    return { map, destroy: () => map.remove(), focus };
  } catch (error) {
    // A half-built map must not outlive the throw. The island retries the
    // build (next intersection, or a later "Show on Map"), which would draw a
    // second map into the same container while this one still holds its
    // canvas, its WebGL context and its marker DOM.
    map.remove();
    throw error;
  }
}

/** Stored [lat, lng] order → GeoJSON [lng, lat] order. */
function flip(point: LatLng): [number, number] {
  return [point[1], point[0]];
}

/** LngLat envelope around corners, in MapLibre's [lng, lat] order. */
function boundAround(corners: [number, number][]): LngLatBounds {
  const bounds = new LngLatBounds(corners[0], corners[0]);
  corners.forEach((corner) => bounds.extend(corner));
  return bounds;
}
