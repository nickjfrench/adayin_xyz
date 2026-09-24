/**
 * Basemap and MapLibre bootstrap shared by both apps. Client-only: it pulls
 * MapLibre and a bundler-emitted worker asset, so it must stay out of any
 * SSR/build-time import graph.
 */
import { setWorkerUrl } from 'maplibre-gl'
import maplibreGlWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

/** The one basemap both apps draw on; its attribution comes with the style. */
export const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/bright'

let configured = false

/**
 * Points MapLibre's web worker at the URL the bundler emitted for
 * `maplibre-gl-worker.mjs`. A plain `?url` asset (or an unresolved
 * `new URL(...)`) leaves the worker request relative to the deployment and
 * breaks tile parsing, so the worker must be bundled. Runs at most once per
 * client bundle — MapLibre reads the setting when it builds its first map, and
 * every later map reuses the same worker pool.
 */
export function configureMapLibreWorkers(): void {
  if (configured) return
  configured = true
  setWorkerUrl(maplibreGlWorkerUrl)
}
