import L from 'leaflet';
import type { TileLayerOptions } from 'leaflet';

export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_OPTIONS: TileLayerOptions = {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  // OSMF now rejects tile requests that carry no Referer with 403 "Access
  // blocked"; the per-tile attribute overrides any stricter document referrer
  // policy the embedding page may set (which the tile usage policy forbids).
  referrerPolicy: 'strict-origin-when-cross-origin',
};

/** Adds the shared OSM tile layer to `map`. */
export function addTileLayer(map: L.Map): L.TileLayer {
  return L.tileLayer(TILE_URL, TILE_OPTIONS).addTo(map);
}
