import { describe, expect, it } from 'vitest';
import {
  CIRCLE_STEPS,
  circleRing,
  distanceMeters,
  mapFeaturePatchFromGeoJSON,
  mapFeatureToGeoJSON,
  type MapFeatureGeoJSON,
} from '@adayin/map-core/geojson';
import type { MapFeatureItem } from '@adayin/map-core';

/** Deterministic stand-in for crypto.randomUUID in polygon point members. */
function pointKeys() {
  let n = 0;
  return () => `key-${++n}`;
}

const brisbane = { lat: -27.47112645806652, lng: 153.01550745964053 };

describe('distanceMeters', () => {
  it('is zero for the same point and one degree of latitude on the stored sphere', () => {
    expect(distanceMeters(brisbane, brisbane)).toBe(0);
    expect(distanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(
      111194.92664455873,
      6,
    );
  });

  it('is symmetric', () => {
    const a = { lat: -27.47, lng: 153.01 };
    const b = { lat: -27.49, lng: 153.03 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 9);
  });
});

describe('circleRing', () => {
  it('closes an 80-step ring by default, every point one radius from the centre', () => {
    const radius = 258.8222485867483;
    const ring = circleRing(brisbane, radius);
    expect(ring).toHaveLength(CIRCLE_STEPS + 1);
    expect(ring[0]).toEqual(ring[CIRCLE_STEPS]);
    for (const [lng, lat] of ring) {
      expect(distanceMeters(brisbane, { lat, lng })).toBeCloseTo(radius, 6);
    }
  });

  it('honours a custom step count', () => {
    const ring = circleRing(brisbane, 100, 8);
    expect(ring).toHaveLength(9);
    expect(ring[0]).toEqual(ring[8]);
  });
});

describe('mapFeatureToGeoJSON', () => {
  it('renders a point as a marker with its feature id and label', () => {
    expect(
      mapFeatureToGeoJSON({ shape: 'point', position: brisbane, label: 'Brisbane Sign' }, 'pin'),
    ).toEqual({
      type: 'Feature',
      id: 'pin',
      properties: { shape: 'marker', label: 'Brisbane Sign' },
      geometry: { type: 'Point', coordinates: [153.01550745964053, -27.47112645806652] },
    });
  });

  it('carries the label as text for a text marker, empty when unlabelled', () => {
    const labelled = mapFeatureToGeoJSON(
      { shape: 'text', position: brisbane, label: 'Lookout' },
      'note',
    );
    expect(labelled?.properties).toEqual({
      shape: 'text_marker',
      label: 'Lookout',
      text: 'Lookout',
    });
    const bare = mapFeatureToGeoJSON({ shape: 'text', position: brisbane }, 'note');
    expect(bare?.properties).toEqual({ shape: 'text_marker', text: '' });
  });

  it('closes the polygon ring and keeps vertex order', () => {
    const polygon = mapFeatureToGeoJSON(
      {
        shape: 'polygon',
        label: 'New zone',
        points: [
          { lat: 1, lng: 2 },
          { lat: 3, lng: 4 },
          { lat: 5, lng: 6 },
        ],
      },
      'zone',
    );
    expect(polygon?.geometry).toEqual({
      type: 'Polygon',
      coordinates: [
        [
          [2, 1],
          [4, 3],
          [6, 5],
          [2, 1],
        ],
      ],
    });
    expect(polygon?.properties).toEqual({ shape: 'polygon', label: 'New zone' });
  });

  it('renders a circle as its ring plus centre and radius in metres', () => {
    const radius = 258.8222485867483;
    const circle = mapFeatureToGeoJSON({ shape: 'circle', position: brisbane, radius }, 'region');
    expect(circle?.properties).toEqual({
      shape: 'circle',
      center: [153.01550745964053, -27.47112645806652],
      radius,
    });
    if (circle?.geometry.type !== 'Polygon') throw new Error('a circle renders as a polygon ring');
    expect(circle.geometry.coordinates[0]).toHaveLength(CIRCLE_STEPS + 1);
  });

  it('adds a color property only when a caller passes one', () => {
    const color = 'oklch(0.53 0.085 185)';
    expect(
      mapFeatureToGeoJSON({ shape: 'point', position: brisbane }, 'pin', color)?.properties,
    ).toEqual({ shape: 'marker', color });
    expect(
      mapFeatureToGeoJSON({ shape: 'point', position: brisbane }, 'pin')?.properties,
    ).not.toHaveProperty('color');
  });

  it('returns null for geometry that cannot draw', () => {
    expect(mapFeatureToGeoJSON({ shape: 'point' }, 'pin')).toBeNull();
    expect(mapFeatureToGeoJSON({ shape: 'text', label: 'Lookout' }, 'note')).toBeNull();
    expect(
      mapFeatureToGeoJSON({ shape: 'polygon', points: [{ lat: 1, lng: 2 }] }, 'zone'),
    ).toBeNull();
    expect(mapFeatureToGeoJSON({ shape: 'circle', position: brisbane }, 'region')).toBeNull();
    expect(mapFeatureToGeoJSON({ shape: 'hexagon' as never, position: brisbane }, 'x')).toBeNull();
  });
});

describe('mapFeaturePatchFromGeoJSON', () => {
  const existing = (over: Partial<MapFeatureItem> = {}): MapFeatureItem => ({
    _key: 'item',
    _type: 'mapFeature',
    shape: 'point',
    position: { _type: 'geopoint', lat: 1, lng: 2 },
    ...over,
  });

  it('writes a point patch with the stored geopoint typing', () => {
    const feature = mapFeatureToGeoJSON({ shape: 'point', position: brisbane }, 'pin')!;
    expect(mapFeaturePatchFromGeoJSON(feature, existing(), pointKeys())).toStrictEqual({
      shape: 'point',
      position: { _type: 'geopoint', lat: brisbane.lat, lng: brisbane.lng },
    });
  });

  it('maps text markers back to the stored text shape, clearing on empty text', () => {
    const feature = mapFeatureToGeoJSON(
      { shape: 'text', position: brisbane, label: 'Lookout' },
      'note',
    )!;
    expect(
      mapFeaturePatchFromGeoJSON(feature, existing({ shape: 'text' }), pointKeys()),
    ).toStrictEqual({
      shape: 'text',
      position: { _type: 'geopoint', lat: brisbane.lat, lng: brisbane.lng },
      label: 'Lookout',
    });
    // An explicit undefined label is what removes the stored label on merge.
    const cleared: MapFeatureGeoJSON = {
      ...feature,
      properties: { shape: 'text_marker', text: '' },
    };
    expect(
      mapFeaturePatchFromGeoJSON(
        cleared,
        existing({ shape: 'text', label: 'Lookout' }),
        pointKeys(),
      ),
    ).toStrictEqual({
      shape: 'text',
      position: { _type: 'geopoint', lat: brisbane.lat, lng: brisbane.lng },
      label: undefined,
    });
  });

  it('keeps the existing label when the GeoJSON never carried one', () => {
    const feature: MapFeatureGeoJSON = {
      type: 'Feature',
      id: 'note',
      properties: { shape: 'text_marker' },
      geometry: { type: 'Point', coordinates: [brisbane.lng, brisbane.lat] },
    };
    expect(
      mapFeaturePatchFromGeoJSON(
        feature,
        existing({ shape: 'text', label: 'Lookout' }),
        pointKeys(),
      ),
    ).toHaveProperty('label', 'Lookout');
  });

  it('regenerates polygon point members and strips the closing vertex', () => {
    const feature = mapFeatureToGeoJSON(
      {
        shape: 'polygon',
        points: [
          { lat: 1, lng: 2 },
          { lat: 3, lng: 4 },
          { lat: 5, lng: 6 },
        ],
      },
      'zone',
    )!;
    expect(
      mapFeaturePatchFromGeoJSON(feature, existing({ shape: 'polygon' }), pointKeys()),
    ).toStrictEqual({
      shape: 'polygon',
      points: [
        { _key: 'key-1', _type: 'geopoint', lat: 1, lng: 2 },
        { _key: 'key-2', _type: 'geopoint', lat: 3, lng: 4 },
        { _key: 'key-3', _type: 'geopoint', lat: 5, lng: 6 },
      ],
    });
  });

  it('reads a MultiPolygon ring, as Geoman exports drawn polygons', () => {
    const feature: MapFeatureGeoJSON = {
      type: 'Feature',
      id: 'zone',
      properties: { shape: 'polygon' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [2, 1],
              [4, 3],
              [6, 5],
              [2, 1],
            ],
          ],
        ],
      },
    };
    expect(
      mapFeaturePatchFromGeoJSON(feature, existing({ shape: 'polygon' }), pointKeys()),
    ).toHaveProperty('points', [
      { _key: 'key-1', _type: 'geopoint', lat: 1, lng: 2 },
      { _key: 'key-2', _type: 'geopoint', lat: 3, lng: 4 },
      { _key: 'key-3', _type: 'geopoint', lat: 5, lng: 6 },
    ]);
  });

  it('derives a circle radius from the ring, not the stale radius property', () => {
    const edited = { lat: brisbane.lat, lng: brisbane.lng + 0.004 };
    // What Geoman leaves behind after a rim drag: fresh geometry, fresh centre,
    // but the custom radius property still carrying the value from import.
    const feature = mapFeatureToGeoJSON(
      { shape: 'circle', position: edited, radius: 390.8 },
      'region',
    )!;
    feature.properties.radius = 258.8222485867483;
    const patch = mapFeaturePatchFromGeoJSON(feature, existing({ shape: 'circle' }), pointKeys());
    expect(patch?.shape).toBe('circle');
    expect(patch?.radius).toBeCloseTo(390.8, 3);
    expect(patch?.radius).not.toBe(258.8222485867483);
  });

  it('falls back to the centre and radius properties when the ring is unusable', () => {
    const feature: MapFeatureGeoJSON = {
      type: 'Feature',
      id: 'region',
      properties: { shape: 'circle', center: [2, 1], radius: 500 },
      geometry: { type: 'Polygon', coordinates: [[]] },
    };
    const patch = mapFeaturePatchFromGeoJSON(feature, existing({ shape: 'circle' }), pointKeys());
    expect(patch).toStrictEqual({
      shape: 'circle',
      position: { _type: 'geopoint', lat: 1, lng: 2 },
      radius: 500,
    });
  });

  it('reads both the prefixed and unprefixed shape properties', () => {
    const ring = circleRing(brisbane, 100);
    for (const shape of ['marker', 'point'] as const) {
      const feature: MapFeatureGeoJSON = {
        type: 'Feature',
        id: 'k',
        properties: { shape },
        geometry: { type: 'Point', coordinates: [brisbane.lng, brisbane.lat] },
      };
      expect(mapFeaturePatchFromGeoJSON(feature, existing(), pointKeys())?.shape).toBe('point');
    }
    expect(
      mapFeaturePatchFromGeoJSON(
        {
          type: 'Feature',
          id: 'k',
          properties: {
            shape: 'marker',
            __gm_shape: 'circle',
            __gm_center: [brisbane.lng, brisbane.lat],
          },
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
        existing({ shape: 'circle' }),
        pointKeys(),
      )?.shape,
    ).toBe('circle');
  });

  it('returns null for unknown shapes and empty polygon rings', () => {
    const unknown: MapFeatureGeoJSON = {
      type: 'Feature',
      id: 'x',
      properties: { shape: 'ellipse' },
      geometry: { type: 'Polygon', coordinates: [circleRing(brisbane, 100)] },
    };
    expect(mapFeaturePatchFromGeoJSON(unknown, existing(), pointKeys())).toBeNull();
    const emptyRing: MapFeatureGeoJSON = {
      type: 'Feature',
      id: 'x',
      properties: { shape: 'polygon' },
      geometry: { type: 'Polygon', coordinates: [[]] },
    };
    expect(
      mapFeaturePatchFromGeoJSON(emptyRing, existing({ shape: 'polygon' }), pointKeys()),
    ).toBeNull();
  });

  it('never invents a label for the shapes whose geometry patch must not touch it', () => {
    const point = mapFeatureToGeoJSON({ shape: 'point', position: brisbane, label: 'Old' }, 'k')!;
    const polygon = mapFeatureToGeoJSON(
      {
        shape: 'polygon',
        label: 'Old',
        points: [
          { lat: 1, lng: 2 },
          { lat: 3, lng: 4 },
          { lat: 5, lng: 6 },
        ],
      },
      'k',
    )!;
    const circle = mapFeatureToGeoJSON(
      { shape: 'circle', position: brisbane, radius: 100, label: 'Old' },
      'k',
    )!;
    for (const feature of [point, polygon, circle]) {
      expect(
        mapFeaturePatchFromGeoJSON(feature, existing({ label: 'Old' }), pointKeys()),
      ).not.toHaveProperty('label');
    }
  });
});
