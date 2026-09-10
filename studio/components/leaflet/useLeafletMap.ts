import {useEffect, useState, type RefObject} from 'react'
import L from 'leaflet'
import {TILE_OPTIONS, TILE_URL} from './leafletConfig'

/**
 * Creates a Leaflet map on the container once it mounts; returns null until then.
 * Center/zoom are initial values only — callers set the view imperatively.
 * Scroll stays free for form scrolling; zoom lives on explicit controls.
 */
export function useLeafletMap(
  containerRef: RefObject<HTMLDivElement | null>,
  center: L.LatLngExpression,
  zoom: number,
): L.Map | null {
  const [map, setMap] = useState<L.Map | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const instance = L.map(el, {center, zoom, scrollWheelZoom: false, zoomControl: false})
    L.control.zoom({position: 'topright'}).addTo(instance)
    L.tileLayer(TILE_URL, TILE_OPTIONS).addTo(instance)
    // Leaflet's trackResize only covers window resizes; studio panes resize
    // the container without a window event.
    const resizeObserver = new ResizeObserver(() => instance.invalidateSize())
    resizeObserver.observe(el)
    setMap(instance)
    return () => {
      resizeObserver.disconnect()
      instance.remove()
      setMap(null)
    }
    // Initial center/zoom only — intentionally not reactive to prop changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef])

  return map
}
