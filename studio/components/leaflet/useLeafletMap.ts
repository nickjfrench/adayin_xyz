import {useEffect, useState} from 'react'
import L from 'leaflet'
import {TILE_OPTIONS, TILE_URL} from './leafletConfig'

/**
 * Creates a Leaflet map on the container once it mounts; returns null until then.
 * Center/zoom are initial values only — callers set the view imperatively.
 * Scroll stays free for form scrolling; zoom lives on explicit controls.
 *
 * The container is taken as a callback ref + state so the map is rebuilt when
 * the DOM node changes — the fullscreen toggle portals the container to
 * document.body (and back), which remounts the node.
 */
export function useLeafletMap(
  center: L.LatLngExpression,
  zoom: number,
): {setContainer: (el: HTMLDivElement | null) => void; map: L.Map | null} {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [map, setMap] = useState<L.Map | null>(null)

  useEffect(() => {
    if (!container) return
    const instance = L.map(container, {center, zoom, scrollWheelZoom: false, zoomControl: false})
    L.control.zoom({position: 'topright'}).addTo(instance)
    L.tileLayer(TILE_URL, TILE_OPTIONS).addTo(instance)
    // Leaflet's trackResize only covers window resizes; studio panes resize
    // the container without a window event.
    const resizeObserver = new ResizeObserver(() => instance.invalidateSize())
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

  return {setContainer, map}
}
