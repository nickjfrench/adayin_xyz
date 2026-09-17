import { useEffect, useState } from 'react'
import { configureMapLibreWorkers, OPENFREEMAP_STYLE_URL } from '@adayin/map-core/basemap'
import { Map, NavigationControl, type FitBoundsOptions, type LngLatBoundsLike } from 'maplibre-gl'

/**
 * Creates a MapLibre map on the container once it mounts; returns null until then.
 * Center/zoom (and optional bounds) are initial values only — callers set the
 * view imperatively afterwards. Passing bounds frames the map at construction
 * (the constructor fits them instantly), so it never loads onto a wrong camera.
 * Scroll stays free for form scrolling; zoom lives on explicit controls.
 *
 * The container is taken as a callback ref + state so the map is rebuilt when
 * the DOM node changes — the fullscreen toggle portals the container to
 * document.body (and back), which remounts the node.
 */
export function useMapLibreMap(
 center: [number, number],
 zoom: number,
 initialBounds?: { bounds: LngLatBoundsLike; fitBoundsOptions?: FitBoundsOptions },
): { setContainer: (el: HTMLDivElement | null) => void; map: Map | null } {
 const [container, setContainer] = useState<HTMLDivElement | null>(null)
 const [map, setMap] = useState<Map | null>(null)

 useEffect(() => {
  if (!container) return
  // Workers first: every Map instance after this reuses the pool.
  configureMapLibreWorkers()
  const instance = new Map({
   container,
   style: OPENFREEMAP_STYLE_URL,
   center,
   zoom,
   scrollZoom: false, // form scrolling stays free; the controls own zoom
   ...(initialBounds ?? {}),
   maxZoom: 20,
   minZoom: 1,
   clickTolerance: 20,
  })
  instance.addControl(new NavigationControl({ showCompass: false, showZoom: true }), 'top-right')
  // MapLibre's own ResizeObserver covers pane resizes, but the studio also
  // remounts the node through the portal toggle — resize explicitly too.
  const resizeObserver = new ResizeObserver(() => instance.resize())
  resizeObserver.observe(container)
  setMap(instance)
  return () => {
   resizeObserver.disconnect()
   instance.remove()
   setMap(null)
  }
  // Initial center/zoom only — intentionally not reactive to prop changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [container])

 return { setContainer, map }
}
