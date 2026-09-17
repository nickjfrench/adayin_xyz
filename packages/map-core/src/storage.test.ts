import { describe, expect, it } from 'vitest';
// Plain Node values only — the stored contract must stay renderer-free.
import {
  EARTH_RADIUS_M,
  mapFeatureBounds,
  mapFeaturesSignature,
  serializeMapFeature,
  type MapFeatureItem,
} from '@adayin/map-core';

/** Deterministic stand-in for crypto.randomUUID in point-member keys. */
function pointKeys() {
  let n = 0;
  return () => `key-${++n}`;
}

describe('serializeMapFeature', () => {
  it('writes a point with its geopoint-typed position and nothing else', () => {
    expect(
      serializeMapFeature(
        { shape: 'point', position: { lat: -27.47, lng: 153.02 } },
        'pin',
        pointKeys(),
      ),
    ).toEqual({
      _key: 'pin',
      _type: 'mapFeature',
      shape: 'point',
      position: { _type: 'geopoint', lat: -27.47, lng: 153.02 },
    });
  });

  it('writes a text label only when the label carries text', () => {
    const withLabel = serializeMapFeature(
      { shape: 'text', position: { lat: 1, lng: 2 }, label: 'Lookout' },
      'note',
      pointKeys(),
    );
    expect(withLabel).toEqual({
      _key: 'note',
      _type: 'mapFeature',
      shape: 'text',
      position: { _type: 'geopoint', lat: 1, lng: 2 },
      label: 'Lookout',
    });
    for (const label of ['', null, undefined]) {
      expect(
        serializeMapFeature(
          { shape: 'text', position: { lat: 1, lng: 2 }, label },
          'note',
          pointKeys(),
        ),
      ).not.toHaveProperty('label');
    }
  });

  it('writes a circle radius whenever it is a number, including zero', () => {
    const base = {
      shape: 'circle' as const,
      position: { lat: -27.47112645806652, lng: 153.01550745964053 },
    };
    expect(serializeMapFeature({ ...base, radius: 258.8222485867483 }, 'c', pointKeys())).toEqual({
      _key: 'c',
      _type: 'mapFeature',
      shape: 'circle',
      position: { _type: 'geopoint', lat: -27.47112645806652, lng: 153.01550745964053 },
      radius: 258.8222485867483,
    });
    expect(serializeMapFeature({ ...base, radius: 0 }, 'c', pointKeys())).toHaveProperty(
      'radius',
      0,
    );
    for (const radius of [null, undefined]) {
      expect(serializeMapFeature({ ...base, radius }, 'c', pointKeys())).not.toHaveProperty(
        'radius',
      );
    }
  });

  it('regenerates polygon point keys while keeping vertices and their order', () => {
    const item = serializeMapFeature(
      {
        shape: 'polygon',
        label: 'South Bank Parklands',
        points: [
          { lat: -27.473478242928127, lng: 153.01994651556018 },
          { lat: -27.4738661368487, lng: 153.0202093720436 },
          { lat: -27.474135044102614, lng: 153.01976948976517 },
        ],
      },
      'zone',
      pointKeys(),
    );
    expect(item).toEqual({
      _key: 'zone',
      _type: 'mapFeature',
      shape: 'polygon',
      label: 'South Bank Parklands',
      points: [
        { _key: 'key-1', _type: 'geopoint', lat: -27.473478242928127, lng: 153.01994651556018 },
        { _key: 'key-2', _type: 'geopoint', lat: -27.4738661368487, lng: 153.0202093720436 },
        { _key: 'key-3', _type: 'geopoint', lat: -27.474135044102614, lng: 153.01976948976517 },
      ],
    });
    expect(
      serializeMapFeature({ shape: 'polygon', points: [] }, 'zone', pointKeys()),
    ).not.toHaveProperty('points');
  });

  it('keeps the stored field order unchanged, patch payloads stay byte-identical', () => {
    const item = serializeMapFeature(
      { shape: 'circle', position: { lat: 1, lng: 2 }, radius: 5, label: 'test' },
      'k',
      pointKeys(),
    );
    expect(Object.keys(item)).toEqual(['_key', '_type', 'shape', 'position', 'radius', 'label']);
    expect(Object.keys(item.position!)).toEqual(['_type', 'lat', 'lng']);
    expect(Object.keys(serializeMapFeature({ shape: 'polygon' }, 'k', pointKeys()))).toEqual([
      '_key',
      '_type',
      'shape',
    ]);
  });
});

describe('mapFeatureBounds', () => {
  it('frames a polygon by its extreme vertices', () => {
    expect(
      mapFeatureBounds({
        shape: 'polygon',
        points: [
          { lat: -27.47, lng: 153.01 },
          { lat: -27.49, lng: 153.03 },
          { lat: -27.48, lng: 153.02 },
        ],
      }),
    ).toEqual({ south: -27.49, west: 153.01, north: -27.47, east: 153.03 });
  });

  it('folds points and text into a zero-area envelope', () => {
    const expected = { south: -27.47, west: 153.02, north: -27.47, east: 153.02 };
    expect(mapFeatureBounds({ shape: 'point', position: { lat: -27.47, lng: 153.02 } })).toEqual(
      expected,
    );
    // A just-created text layer has no label yet but still frames the view.
    expect(mapFeatureBounds({ shape: 'text', position: { lat: -27.47, lng: 153.02 } })).toEqual(
      expected,
    );
  });

  it('returns null when the feature has nothing to frame', () => {
    const empty = [
      { shape: 'point' as const },
      { shape: 'point' as const, position: null },
      { shape: 'text' as const, label: 'Lookout' },
      { shape: 'polygon' as const, points: [] },
      { shape: 'polygon' as const, points: null },
      { shape: 'circle' as const, position: { lat: 1, lng: 2 } },
      { shape: 'circle' as const, radius: 500 },
      { shape: 'hexagon' as never, position: { lat: 1, lng: 2 } },
    ];
    for (const feature of empty) expect(mapFeatureBounds(feature)).toBeNull();
  });

  it('wraps a circle by its radius in metres', () => {
    const center = { lat: -27.47112645806652, lng: 153.01550745964053 };
    const radius = 258.8222485867483;
    const bounds = mapFeatureBounds({ shape: 'circle', position: center, radius });
    expect(bounds).not.toBeNull();
    const toMetres = (degrees: number) => ((degrees * Math.PI) / 180) * EARTH_RADIUS_M;
    expect((bounds!.north + bounds!.south) / 2).toBeCloseTo(center.lat, 12);
    expect((bounds!.east + bounds!.west) / 2).toBeCloseTo(center.lng, 12);
    expect(toMetres((bounds!.north - bounds!.south) / 2)).toBeCloseTo(radius, 6);
    expect(
      toMetres((bounds!.east - bounds!.west) / 2) * Math.cos((center.lat * Math.PI) / 180),
    ).toBeCloseTo(radius, 6);
  });
});

describe('mapFeaturesSignature', () => {
  const item = (over: Partial<MapFeatureItem> = {}): MapFeatureItem => ({
    _key: 'zone',
    _type: 'mapFeature',
    shape: 'polygon',
    label: 'Zone',
    points: [
      { lat: 1, lng: 2 },
      { lat: 3, lng: 4 },
    ],
    ...over,
  });
  const signature = (items: MapFeatureItem[]) => mapFeaturesSignature(items);

  it('ignores regenerated point member keys and types', () => {
    const before = signature([
      item({ points: [{ _key: 'old-1', _type: 'geopoint', lat: 1, lng: 2 }] }),
    ]);
    const after = signature([
      item({ points: [{ _key: 'new-1', _type: 'geopoint', lat: 1, lng: 2 }] }),
    ]);
    expect(after).toBe(before);
  });

  it('changes when geometry, label, radius or keys change', () => {
    const base = signature([item()]);
    expect(signature([item({ label: 'Zone 2' })])).not.toBe(base);
    expect(signature([item({ radius: 5 })])).not.toBe(base);
    expect(
      signature([
        item({
          points: [
            { lat: 1, lng: 2 },
            { lat: 3, lng: 5 },
          ],
        }),
      ]),
    ).not.toBe(base);
    expect(signature([item({ _key: 'other' })])).not.toBe(base);
    expect(signature([item(), item({ _key: 'second' })])).not.toBe(base);
  });
});
