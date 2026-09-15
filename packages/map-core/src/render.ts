/**
 * Leaflet render primitives shared by the studio stop map and the web
 * itinerary map. The two apps keep their own look via the `style` they pass —
 * a deliberate, single place for intentional drift instead of two copies of
 * the render logic.
 */

import L from 'leaflet';
import type { MapFeature, MapFeaturePoint } from './core';

export interface FeatureStyle {
  color: string;
  weight: number;
  opacity: number;
  fillOpacity: number;
  lineCap?: L.LineCapShape;
}

/** Style + dot parameters for a feature layer. Callers own both looks:
 * `style.color` strokes the regions (polygons/circles), `pointColor`/`pointSize`
 * build the dot icon for point features. */
export interface FeatureLayerOpts {
  style: FeatureStyle;
  pointColor: string;
  pointSize: number;
}

const toLatLng = (p: MapFeaturePoint) => [p.lat, p.lng] as [number, number];

/**
 * Shared circular pin — inline-styled span with a white ring (className ''
 * drops Leaflet's default white box). Used for the location pin and the
 * feature dots. Color is required: the studio pin is teal, feature points
 * amber, the web's dots per-stop.
 */
export function dotIcon(size: number, color: string): L.DivIcon {
  const ring = Math.max(2, Math.round(size / 8));
  const total = size + ring * 2;
  return L.divIcon({
    className: '',
    html:
      `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;` +
      `background:${color};box-shadow:0 0 0 ${ring}px #fff, 0 1px 3px rgba(0,0,0,0.35)"></span>`,
    iconSize: [total, total],
    iconAnchor: [total / 2, total / 2],
  });
}

/** White pill with the label text — 12px/600, centered on the point. */
export function textLabelIcon(label: string): L.DivIcon {
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

/** Dot marker for a point feature; null without a position. */
export function pointLayer(f: MapFeature, opts: FeatureLayerOpts): L.Layer | null {
  return f.position
    ? L.marker(toLatLng(f.position), { icon: dotIcon(opts.pointSize, opts.pointColor) })
    : null;
}

/** Region polygon; null below three vertices. */
export function polygonLayer(f: MapFeature, opts: FeatureLayerOpts): L.Layer | null {
  return f.points && f.points.length >= 3
    ? L.polygon(f.points.map(toLatLng), opts.style)
    : null;
}

/** Radius circle; null without a position or radius. */
export function circleLayer(f: MapFeature, opts: FeatureLayerOpts): L.Layer | null {
  return f.position && f.radius
    ? L.circle([f.position.lat, f.position.lng], { ...opts.style, radius: f.radius })
    : null;
}

/** Text label marker; null without a position (web predicate also wants a label). */
export function textLabelLayer(f: MapFeature): L.Layer | null {
  return f.label && f.position
    ? L.marker(toLatLng(f.position), { icon: textLabelIcon(f.label) })
    : null;
}

/**
 * Renders a feature via its shape primitive, binding its label as tooltip when
 * present. `opts.style.color` tints the region, `opts.pointColor` the dot —
 * callers pass a per-stop color so overlapping regions stay attributable.
 */
export function featureLayer(f: MapFeature, opts: FeatureLayerOpts): L.Layer | null {
  const layer =
    f.shape === 'point'
      ? pointLayer(f, opts)
      : f.shape === 'polygon'
        ? polygonLayer(f, opts)
        : f.shape === 'circle'
          ? circleLayer(f, opts)
          : f.shape === 'text'
            ? textLabelLayer(f)
            : null;
  // Text labels render their content in the marker itself; only the other
  // shapes carry a Leaflet tooltip.
  if (layer && f.label && f.shape !== 'text') layer.bindTooltip(f.label);
  return layer;
}

/**
 * Viewport envelope of a feature, or null when its geometry is missing.
 * Unlike featureIsDrawable (core.ts), a text feature needs only a position
 * here — a just-created text layer has no label yet but still frames the view.
 * A radius-less circle frames nothing either: circleLayer draws nothing for it.
 */
export function featureBounds(f: MapFeature): L.LatLngBounds | null {
  if (f.shape === 'circle') {
    return f.position && f.radius
      ? L.latLng(f.position.lat, f.position.lng).toBounds(f.radius * 2)
      : null;
  }
  if (f.position && (f.shape === 'point' || f.shape === 'text')) {
    // Zero-area corner pair for points/text; fitBounds padding handles it.
    return L.latLngBounds([toLatLng(f.position), toLatLng(f.position)]);
  }
  if (f.shape === 'polygon' && f.points && f.points.length > 0) {
    return L.latLngBounds(f.points.map(toLatLng));
  }
  return null;
}
