/**
 * GeoJSON conversion for map features — pure, renderer-free, and shared by the
 * studio editor (its Geoman adapter imports and exports GeoJSON) and the web
 * renderer (its sources are built from the same conversion).
 *
 * Coordinates here are `[lng, lat]` GeoJSON pairs, not the stored `{lat, lng}`
 * order; the tuple is mutable so it can be handed to MapLibre and Geoman as-is.
 */

import {
  EARTH_RADIUS_M,
  type MapFeature,
  type MapFeatureGeometry,
  type MapFeatureItem,
  type MapFeaturePoint,
} from './core';

/** GeoJSON axis order: `[lng, lat]`. */
export type LngLat = [number, number];

/** Closed ring resolution for circles — matches the 80 steps Geoman draws and
 * edits its own circles at, so an imported circle and a drawn one are the same
 * shape. */
export const CIRCLE_STEPS = 80;

/** Great-circle distance in metres, on the sphere the stored radii are measured on. */
export function distanceMeters(a: MapFeaturePoint, b: MapFeaturePoint): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Closed ring of `steps` points `radiusMeters` from `center`, in `[lng, lat]`.
 * One point per step plus the repeated first point that closes the ring.
 */
export function circleRing(
  center: MapFeaturePoint,
  radiusMeters: number,
  steps = CIRCLE_STEPS,
): LngLat[] {
  const lat1 = (center.lat * Math.PI) / 180;
  const lng1 = (center.lng * Math.PI) / 180;
  const angular = radiusMeters / EARTH_RADIUS_M;
  const ring: LngLat[] = [];
  for (let step = 0; step < steps; step++) {
    const bearing = (-2 * Math.PI * step) / steps;
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
    );
    const lng2 =
      lng1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
        Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
      );
    ring.push([(((lng2 * 180) / Math.PI + 540) % 360) - 180, (lat2 * 180) / Math.PI]);
  }
  ring.push([...ring[0]]);
  return ring;
}

export type MapFeatureGeometryJSON =
  | { type: 'Point'; coordinates: LngLat }
  | { type: 'Polygon'; coordinates: LngLat[][] }
  | { type: 'MultiPolygon'; coordinates: LngLat[][][] };

/**
 * Feature properties we author, plus the `__gm_`-prefixed shape properties an
 * editor (Geoman) rewrites into the same object: `__gm_shape`, `__gm_center`,
 * `__gm_text`, and so on. Readers accept both spellings so one conversion
 * serves a fresh export and a feature that already passed an editor.
 */
export type MapFeatureProperties = {
  shape: string;
  label?: string;
  color?: string;
  text?: string;
  center?: LngLat;
  radius?: number;
} & Partial<Record<`__gm_${string}`, unknown>>;

export interface MapFeatureGeoJSON {
  type: 'Feature';
  id: string | number;
  properties: MapFeatureProperties;
  geometry: MapFeatureGeometryJSON;
}

/**
 * Renders a feature as GeoJSON for a map source or an editor import, or null
 * when the shape cannot draw (no position, fewer than three vertices). Shape
 * names are the editors' vocabulary: point→marker, text→text_marker, so a
 * Geoman import keeps the stored kind. `color` rides along as a property for
 * data-driven paint styles; callers that don't need it can omit it. `id` is the
 * GeoJSON feature id — the studio passes the stored `_key`, the web numbers its
 * features, because MapLibre matches feature-state on integer ids only (a string
 * id is parsed to a number for rendering but hashed for state, so the state
 * never lands).
 */
export function mapFeatureToGeoJSON(
  feature: MapFeature,
  id: string | number,
  color?: string,
): MapFeatureGeoJSON | null {
  const properties: MapFeatureGeoJSON['properties'] = { shape: feature.shape };
  if (feature.label) properties.label = feature.label;
  if (color) properties.color = color;
  const position = feature.position;
  if (feature.shape === 'point' || feature.shape === 'text') {
    if (!position) return null;
    properties.shape = feature.shape === 'point' ? 'marker' : 'text_marker';
    if (feature.shape === 'text') properties.text = feature.label ?? '';
    return {
      type: 'Feature',
      id,
      properties,
      geometry: { type: 'Point', coordinates: [position.lng, position.lat] },
    };
  }
  if (feature.shape === 'polygon') {
    const points = feature.points;
    if (!points || points.length < 3) return null;
    const ring: LngLat[] = points.map((point) => [point.lng, point.lat]);
    ring.push([...ring[0]]);
    return { type: 'Feature', id, properties, geometry: { type: 'Polygon', coordinates: [ring] } };
  }
  if (feature.shape === 'circle') {
    if (!position || !feature.radius) return null;
    properties.shape = 'circle';
    properties.center = [position.lng, position.lat];
    properties.radius = feature.radius;
    return {
      type: 'Feature',
      id,
      properties,
      geometry: { type: 'Polygon', coordinates: [circleRing(position, feature.radius)] },
    };
  }
  return null;
}

/** Outer ring of the first polygon, Polygon and MultiPolygon alike. */
function outerRing(geometry: MapFeatureGeometryJSON): LngLat[] {
  switch (geometry.type) {
    case 'Polygon':
      return geometry.coordinates[0] ?? [];
    case 'MultiPolygon':
      return geometry.coordinates[0]?.[0] ?? [];
    default:
      return [];
  }
}

/** Reader for one shape property, preferring the editor's prefixed spelling. */
function shapeProperty<T>(properties: MapFeatureProperties, name: string): T | undefined {
  const record: Record<string, unknown> = properties;
  return (record[`__gm_${name}`] ?? record[name]) as T | undefined;
}

/**
 * Converts an editor's GeoJSON feature back into the stored geometry of
 * `existing`, ready to merge (`{...existing, ...patch}`) so fields this
 * conversion doesn't own — above all labels and the raw item's untouched
 * members — survive verbatim. Returns null for shapes the store has no name
 * for.
 *
 * Polygon vertices come back with fresh `_key`s and `_type: 'geopoint'`, the
 * same stored member shape the editor has always written. A circle's radius
 * comes from the ring, not from the `radius` property: Geoman resizes a circle
 * by rewriting its geometry and leaves custom properties stale, so the ring is
 * the only source that follows an edit.
 */
export function mapFeaturePatchFromGeoJSON(
  feature: MapFeatureGeoJSON,
  existing: MapFeatureItem,
  nextPointKey: () => string,
): MapFeatureGeometry | null {
  const shape = shapeProperty<string>(feature.properties, 'shape');
  const storedShape =
    shape === 'marker' || shape === 'point'
      ? 'point'
      : shape === 'text_marker' || shape === 'text'
        ? 'text'
        : shape === 'polygon' || shape === 'circle'
          ? shape
          : null;
  if (!storedShape) return null;

  if (storedShape === 'point') {
    if (feature.geometry.type !== 'Point') return null;
    const [lng, lat] = feature.geometry.coordinates;
    return { shape: 'point', position: { _type: 'geopoint', lat, lng } };
  }
  if (storedShape === 'text') {
    if (feature.geometry.type !== 'Point') return null;
    const [lng, lat] = feature.geometry.coordinates;
    const text = shapeProperty<string>(feature.properties, 'text');
    // An empty text property is a cleared label; an absent one is foreign
    // GeoJSON that never carried the label, which must not blank the item.
    return {
      shape: 'text',
      position: { _type: 'geopoint', lat, lng },
      label: text != null ? text || undefined : (existing.label ?? undefined),
    };
  }
  if (storedShape === 'polygon') {
    // GeoJSON rings repeat their first vertex to close; stored points don't.
    const ring = [...outerRing(feature.geometry)];
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (ring.length > 1 && first && last && first[0] === last[0] && first[1] === last[1])
      ring.pop();
    const points = ring.map(([lng, lat]) => ({
      _key: nextPointKey(),
      _type: 'geopoint',
      lat,
      lng,
    }));
    // Three vertices or it is not a ring: a shorter one never draws
    // (mapFeatureToGeoJSON drops it), so storing it would only leave an item the
    // map can neither show nor edit.
    return points.length >= 3 ? { shape: 'polygon', points } : null;
  }
  const center =
    shapeProperty<LngLat>(feature.properties, 'center') ?? centerOfRing(feature.geometry);
  if (!center) return null;
  const [lng, lat] = center;
  const rim = outerRing(feature.geometry)[0];
  const radius = rim ? distanceMeters({ lat, lng }, { lat: rim[1], lng: rim[0] }) : undefined;
  return {
    shape: 'circle',
    position: { _type: 'geopoint', lat, lng },
    radius:
      radius ||
      shapeProperty<number>(feature.properties, 'radius') ||
      (existing.radius ?? undefined),
  };
}

/** Fallback centre for a circle feature that carries no center property. */
function centerOfRing(geometry: MapFeatureGeometryJSON): LngLat | null {
  const ring = outerRing(geometry);
  if (!ring.length) return null;
  let lng = 0;
  let lat = 0;
  // The ring repeats its first point; skip the duplicate so it can't skew the mean.
  const last = ring[ring.length - 1];
  const count =
    ring.length > 1 && last[0] === ring[0][0] && last[1] === ring[0][1]
      ? ring.length - 1
      : ring.length;
  for (let i = 0; i < count; i++) {
    lng += ring[i][0];
    lat += ring[i][1];
  }
  return [lng / count, lat / count];
}
