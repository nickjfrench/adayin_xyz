import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {FormPatch, ObjectInputProps, set, setIfMissing, unset} from 'sanity'
import {Button, Flex, Stack, Text} from '@sanity/ui'
import {CollapseIcon} from '@sanity/icons/Collapse'
import {ExpandIcon} from '@sanity/icons/Expand'
import {TrashIcon} from '@sanity/icons/Trash'
import {Map as MapLibreMap, Marker, type MapMouseEvent} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {dotElement, flashPin} from '@adayin/map-core/dom'
import {mapsQueryUrl} from '@adayin/map-core/core'
import {useMapLibreMap} from './useMapLibreMap'
import {PlacesSearch, mapViewport, shieldMapElement, type SelectedPlace} from './googlePlaces'
import {DEFAULT_CENTER, DEFAULT_ZOOM, PIN_COLOR, PIN_FLASH, VALUE_ZOOM} from './mapConfig'
import './mapInput.css'

/**
 * Multipart location input: MapLibre map + Places search over
 * {lat, lng, formattedAddress, mapsUri}. A place search stores the Place's
 * own address and Maps URI; a manual pin (map click / marker drag) rewrites
 * mapsUri as a lat,lng query URL and keeps any previously known address.
 */
export function LocationInput(props: ObjectInputProps & {apiKey?: string}) {
  const {value, onChange, schemaType, readOnly, apiKey} = props
  const markerRef = useRef<{marker: Marker; map: MapLibreMap} | null>(null)
  const lat = value?.lat
  const lng = value?.lng
  const formattedAddress = value?.formattedAddress
  const hasValue = lat != null && lng != null

  const {setContainer, map} = useMapLibreMap(
    hasValue ? [lng, lat] : DEFAULT_CENTER,
    hasValue ? VALUE_ZOOM : DEFAULT_ZOOM,
  )
  const viewport = useMemo(() => (map ? mapViewport(map) : null), [map])

  // Converges legacy geopoint-typed values to `location` on first edit.
  const typePatch = useCallback(
    (): FormPatch[] =>
      value?._type != null && value._type !== schemaType.name
        ? [set(schemaType.name, ['_type'])]
        : [],
    [value?._type, schemaType],
  )

  // Manual placement (map click, marker drag): mapsUri becomes a lat,lng query URL.
  const handlePin = useCallback(
    (pin: {lat: number; lng: number}) => {
      const patches: FormPatch[] = [
        setIfMissing({_type: schemaType.name}),
        set(pin.lat, ['lat']),
        set(pin.lng, ['lng']),
      ]
      onChange([...patches, ...typePatch(), set(mapsQueryUrl(pin.lat, pin.lng), ['mapsUri'])])
    },
    [onChange, schemaType, typePatch],
  )
  // Event closures (marker dragend) read the ref so they never go stale.
  const handlePinRef = useRef(handlePin)
  handlePinRef.current = handlePin

  // Place search: store the Place's formattedAddress + googleMapsURI.
  const handlePlace = useCallback(
    (place: SelectedPlace) => {
      const patches: FormPatch[] = [
        setIfMissing({_type: schemaType.name}),
        set(place.lat, ['lat']),
        set(place.lng, ['lng']),
      ]
      for (const key of ['formattedAddress', 'mapsUri'] as const) {
        patches.push(place[key] != null ? set(place[key], [key]) : unset([key]))
      }
      onChange([...patches, ...typePatch()])
    },
    [onChange, schemaType, typePatch],
  )

  // Map click sets a pin only when none exists yet (prevents accidental moves).
  useEffect(() => {
    if (!map) return
    const onClick = (event: MapMouseEvent) => {
      if (!readOnly && !hasValue) handlePin({lat: event.lngLat.lat, lng: event.lngLat.lng})
    }
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
    }
  }, [map, readOnly, hasValue, handlePin])

  // Keep the pin in sync with the value: create on first value, reposition on
  // external changes (undo/paste). Dragend already matches the new value, so
  // the position comparison skips panning while the user drags. The marker is
  // rebuilt when it belongs to a map instance that has since been replaced
  // (the fullscreen portal remounts the map).
  useEffect(() => {
    if (!map) return
    if (lat == null || lng == null) {
      markerRef.current?.marker.remove()
      markerRef.current = null
      return
    }
    const current = markerRef.current
    if (current && current.map !== map) {
      current.marker.remove()
      markerRef.current = null
    }
    const marker = markerRef.current?.marker
    if (!marker) {
      const next = new Marker({
        element: dotElement(16, PIN_COLOR),
        anchor: 'center',
        draggable: !readOnly,
        // The map's 20px click tolerance would otherwise swallow short drags
        // (Marker falls back to it), killing small pin corrections; the
        // Leaflet editor moved the pin after ~3px.
        clickTolerance: 3,
      })
        .setLngLat([lng, lat])
        .addTo(map)
      next.on('dragend', () => {
        const position = next.getLngLat()
        handlePinRef.current({lat: position.lat, lng: position.lng})
      })
      markerRef.current = {marker: next, map}
    } else {
      marker.setDraggable(!readOnly)
      if (marker.getLngLat().lat !== lat || marker.getLngLat().lng !== lng) {
        marker.setLngLat([lng, lat])
        map.jumpTo({center: [lng, lat], zoom: map.getZoom()})
      }
    }
  }, [map, lat, lng, readOnly])

  // A place search lands the pin the editor didn't aim at, and the map jump is
  // instant — blink it (PIN_FLASH) so the result is impossible to miss. Runs
  // after the sync effect above, so the marker element is there to blink. The
  // lat/lng deps re-run this on a drag or an external edit, which must not.
  const [flashSeq, setFlashSeq] = useState(0)
  const flashedRef = useRef(0)
  useEffect(() => {
    if (flashSeq === flashedRef.current) return
    flashedRef.current = flashSeq
    flashPin(markerRef.current?.marker.getElement(), PIN_FLASH)
  }, [flashSeq, lat, lng])

  // Near-fullscreen expand. Fixed positioning keeps the same map instance
  // alive (no remount); the hook's ResizeObserver re-sizes the map.
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])
  // The hook disables wheel zoom so the form scrolls; through a fullscreen
  // overlay the form isn't reachable, so wheel zoom is safe while expanded.
  useEffect(() => {
    if (!map) return
    if (expanded) map.scrollZoom.enable()
    else map.scrollZoom.disable()
    return () => {
      map.scrollZoom.disable()
    }
  }, [map, expanded])

  // Place search: one action, and none at all when the field is read-only —
  // PlacesSearch discards a picked place that has no action to run.
  const searchActions = useMemo(
    () =>
      apiKey && map && viewport && !readOnly
        ? [
            {
              label: 'Set as location',
              onPick: (place: SelectedPlace) => {
                handlePlace(place)
                map.jumpTo({
                  center: [place.lng, place.lat],
                  zoom: Math.max(map.getZoom(), 15),
                })
                setFlashSeq((n) => n + 1)
              },
            },
          ]
        : [],
    [apiKey, map, viewport, readOnly, handlePlace],
  )

  // The expand control is a child of the map container, and the container's own
  // listeners sit above it, so its click would reach the map's handlers first
  // and could drop a pin under the button. Stable ref callback: React re-runs
  // it only when the portal toggle remounts the node.
  const shieldExpand = useCallback((el: HTMLDivElement | null) => {
    shieldMapElement(el)
  }, [])

  // The fullscreen overlay portals to document.body: fixed positioning inside
  // the studio form can be hijacked by transformed/contained ancestors and
  // loses the stacking war with studio chrome. Portalling remounts the map
  // node (useMapLibreMap rebuilds the instance; the sync effect rebuilds the pin).
  const mapNode = (
    <div
      ref={setContainer}
      className={expanded ? 'map-input-map map-input-expanded' : 'map-input-map'}
    >
      {apiKey && viewport && searchActions.length > 0 && (
        <PlacesSearch apiKey={apiKey} viewport={viewport} actions={searchActions} />
      )}
      <div ref={shieldExpand} className="map-input-expand">
        <Button
          aria-label={expanded ? 'Collapse map' : 'Expand map'}
          icon={expanded ? CollapseIcon : ExpandIcon}
          mode="bleed"
          onClick={() => setExpanded(!expanded)}
        />
      </div>
    </div>
  )

  return (
    <Stack gap={2}>
      <div className="map-input-map-slot">
        {expanded ? createPortal(mapNode, document.body) : mapNode}
      </div>
      {hasValue ? (
        <Stack gap={2}>
          <Flex align="center" gap={2}>
            <Text size={1} muted style={{flex: 1}}>
              {/* Primary line mirrors what the site renders as the Maps link text. */}
              Primary POI: {formattedAddress || `${lat.toFixed(6)}, ${lng.toFixed(6)}`}
            </Text>
            <Button
              icon={TrashIcon}
              mode="ghost"
              tone="critical"
              text="Remove"
              disabled={readOnly}
              onClick={() => onChange(unset([]))}
            />
          </Flex>
          {formattedAddress != null && (
            <Text size={0} muted>
              {lat.toFixed(6)}, {lng.toFixed(6)}
            </Text>
          )}
        </Stack>
      ) : (
        <Text size={1} muted>
          Click the map or search to set the pin — drag the pin to move it.
        </Text>
      )}
    </Stack>
  )
}
