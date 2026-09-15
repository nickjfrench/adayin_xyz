import { describe, expect, it } from 'vitest';
// Runs in plain Node (no DOM). The bare specifier is the SSR-safe entry, so
// importing it here fails the moment the kit starts re-exporting Leaflet —
// which is what keeps [slug].astro's build-time imports working.
import {
  SHAPE_NAMES,
  arcPoints,
  featureIsDrawable,
  mapsQueryUrl,
  type ShapeName,
} from '@adayin/map-core';

describe('SHAPE_NAMES', () => {
  it('matches the stored schema list byte for byte', () => {
    expect([...SHAPE_NAMES]).toEqual(['point', 'text', 'polygon', 'circle']);
  });
});

describe('mapsQueryUrl', () => {
  it('builds the raw-coordinate Google Maps search URL', () => {
    expect(mapsQueryUrl(1.5, 2.25)).toBe(
      'https://www.google.com/maps/search/?api=1&query=1.5,2.25',
    );
  });
});

describe('featureIsDrawable', () => {
  const p = { lat: 10, lng: 20 };
  const cases: Array<[string, Parameters<typeof featureIsDrawable>[0], boolean]> = [
    ['point with position', { shape: 'point', position: p }, true],
    ['point without position', { shape: 'point', position: null }, false],
    ['text with label and position', { shape: 'text', position: p, label: 'Lookout' }, true],
    ['text without label', { shape: 'text', position: p, label: null }, false],
    ['text without position', { shape: 'text', label: 'Lookout' }, false],
    ['polygon with three vertices', { shape: 'polygon', points: [p, p, p] }, true],
    ['polygon with two vertices', { shape: 'polygon', points: [p, p] }, false],
    ['polygon without vertices', { shape: 'polygon' }, false],
    ['circle with position and radius', { shape: 'circle', position: p, radius: 500 }, true],
    ['circle without radius', { shape: 'circle', position: p }, false],
    ['circle with zero radius', { shape: 'circle', position: p, radius: 0 }, false],
    // An unknown shape (removed kind, bad import) renders nothing, so it must
    // not report drawable however complete its geometry looks.
    ['unknown shape with position', { shape: 'hexagon' as ShapeName, position: p }, false],
  ];

  it.each(cases)('%s → %s', (_name, feature, expected) => {
    expect(featureIsDrawable(feature)).toBe(expected);
  });
});

describe('arcPoints', () => {
  // 0.5° leg in longitude at lat 10 — short enough to pin the bulge cap.
  const a: [number, number] = [10, 20];
  const b: [number, number] = [10, 30];

  it('samples the straight line a→b for offsetIndex 0', () => {
    const pts = arcPoints(a, b, 0);
    expect(pts).toHaveLength(25);
    expect(pts[0]).toEqual([10, 20]);
    expect(pts[24]).toEqual([10, 30]);
    expect(pts[12]).toEqual([10, 25]); // t = 0.5 midpoint
  });

  it('pushes the t = 0.5 apex perpendicular for offsetIndex 1', () => {
    const pts = arcPoints(a, b, 1);
    expect(pts).toHaveLength(25);
    expect(pts[0]).toEqual([10, 20]);
    expect(pts[24]).toEqual([10, 30]);
    const [apexLat, apexLng] = pts[12];
    expect(apexLng).toBeCloseTo(25, 10); // apex stays on the midway parallel
    // Off the straight line by half the perpendicular bulge (0.5 × 0.03°) — the
    // exact value pins the 0.03° cap, not merely "some" positive bulge.
    expect(apexLat).toBeCloseTo(9.985, 6);
  });
});
