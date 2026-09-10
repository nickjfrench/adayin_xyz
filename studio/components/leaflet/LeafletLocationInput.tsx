import {useCallback, useEffect, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {FormPatch, ObjectInputProps, set, setIfMissing, unset} from 'sanity'
import {Button, Flex, Stack, Text} from '@sanity/ui'
import {CollapseIcon} from '@sanity/icons/Collapse'
import {ExpandIcon} from '@sanity/icons/Expand'
import {TrashIcon} from '@sanity/icons/Trash'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {useLeafletMap} from './useLeafletMap'
import {createDotIcon} from './shapes'
import {PlacesSearch, type SelectedPlace} from './googlePlaces'
import {mapsQueryUrl} from './mapsUrl'
import {DEFAULT_CENTER, DEFAULT_ZOOM, VALUE_ZOOM} from './leafletConfig'
import './mapInput.css'

/**
 * Multipart location input: Leaflet map + Places search over
 * {lat, lng, formattedAddress, mapsUri}. A place search stores the Place's
 * own address and Maps URI; a manual pin (map click / marker drag) rewrites
 * mapsUri as a lat,lng query URL and keeps any previously known address.
 */
export function LeafletLocationInput(props: ObjectInputProps & {apiKey?: string}) {
  const {value, onChange, schemaType, readOnly, apiKey} = props
  const markerRef = useRef<L.Marker | null>(null)
  const lat = value?.lat
  const lng = value?.lng
  const formattedAddress = value?.formattedAddress
  const hasValue = lat != null && lng != null

  const {setContainer, map} = useLeafletMap(
    hasValue ? [lat, lng] : DEFAULT_CENTER,
    hasValue ? VALUE_ZOOM : DEFAULT_ZOOM,
  )

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
    const onClick = (e: L.LeafletMouseEvent) => {
      if (!readOnly && !hasValue) handlePin({lat: e.latlng.lat, lng: e.latlng.lng})
    }
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
    }
  }, [map, readOnly, hasValue, handlePin])

  // Keep the marker in sync with the value: create on first value, reposition
  // on external changes (undo/paste). Dragend already matches the new value,
  // so the position comparison skips panning while the user drags.
  useEffect(() => {
    if (!map) return
    if (lat == null || lng == null) {
      if (markerRef.current) {
        map.removeLayer(markerRef.current)
        markerRef.current = null
      }
      return
    }
    const marker = markerRef.current
    if (!marker) {
      const m = L.marker([lat, lng], {icon: createDotIcon(16), draggable: !readOnly}).addTo(map)
      m.on('dragend', () => {
        const p = m.getLatLng()
        handlePin({lat: p.lat, lng: p.lng})
      })
      markerRef.current = m
    } else if (marker.getLatLng().lat !== lat || marker.getLatLng().lng !== lng) {
      marker.setLatLng([lat, lng])
      map.setView([lat, lng], map.getZoom())
    }
  }, [map, lat, lng, readOnly, handlePin])

  // Near-fullscreen expand. Fixed positioning keeps the same Leaflet instance
  // alive (no remount); useLeafletMap's ResizeObserver re-sizes the map.
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
    if (expanded) map.scrollWheelZoom.enable()
    else map.scrollWheelZoom.disable()
    return () => {
      map.scrollWheelZoom.disable()
    }
  }, [map, expanded])

  // The fullscreen overlay portals to document.body: fixed positioning inside
  // the studio form can be hijacked by transformed/contained ancestors and
  // loses the stacking war with studio chrome. Portalling remounts the map
  // node (useLeafletMap rebuilds the instance; the pin refits from the value).
  const mapNode = (
    <div
      ref={setContainer}
      className={expanded ? 'leaflet-input-map leaflet-input-expanded' : 'leaflet-input-map'}
    >
      {apiKey && map && (
        <PlacesSearch
          apiKey={apiKey}
          actions={[
            {
              label: 'Set as location',
              onPick: (place) => {
                handlePlace(place)
                map.setView([place.lat, place.lng], Math.max(map.getZoom(), 15))
              },
            },
          ]}
        />
      )}
      <Button
        aria-label={expanded ? 'Collapse map' : 'Expand map'}
        icon={expanded ? CollapseIcon : ExpandIcon}
        mode="bleed"
        className="leaflet-input-expand"
        onClick={() => setExpanded(!expanded)}
      />
    </div>
  )

  return (
    <Stack space={2}>
      <div className="leaflet-input-map-slot">
        {expanded ? createPortal(mapNode, document.body) : mapNode}
      </div>
      {hasValue ? (
        <Stack space={2}>
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
