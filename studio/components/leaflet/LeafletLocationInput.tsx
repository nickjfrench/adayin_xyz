import {useCallback, useEffect, useRef} from 'react'
import {FormPatch, ObjectInputProps, set, setIfMissing, unset} from 'sanity'
import {Button, Flex, Stack, Text} from '@sanity/ui'
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
  const containerRef = useRef<HTMLDivElement | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const lat = value?.lat
  const lng = value?.lng
  const formattedAddress = value?.formattedAddress
  const hasValue = lat != null && lng != null

  const map = useLeafletMap(
    containerRef,
    hasValue ? [lat, lng] : DEFAULT_CENTER,
    hasValue ? VALUE_ZOOM : DEFAULT_ZOOM,
  )

  // Converges legacy geopoint-typed values to `location` on first edit.
  const typePatch = useCallback((): FormPatch[] =>
    value?._type != null && value._type !== schemaType.name ? [set(schemaType.name, ['_type'])] : [], [value?._type, schemaType])

  // Manual placement (map click, marker drag): mapsUri becomes a lat,lng query URL.
  const handlePin = useCallback(
    (pin: {lat: number; lng: number}) => {
      const patches: FormPatch[] = [setIfMissing({_type: schemaType.name}), set(pin.lat, ['lat']), set(pin.lng, ['lng'])]
      onChange([...patches, ...typePatch(), set(mapsQueryUrl(pin.lat, pin.lng), ['mapsUri'])])
    },
    [onChange, schemaType, typePatch],
  )

  // Place search: store the Place's formattedAddress + googleMapsURI.
  const handlePlace = useCallback(
    (place: SelectedPlace) => {
      const patches: FormPatch[] = [setIfMissing({_type: schemaType.name}), set(place.lat, ['lat']), set(place.lng, ['lng'])]
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

  return (
    <Stack space={2}>
      <div ref={containerRef} className="leaflet-input-map">
        {apiKey && map && (
          <PlacesSearch
            apiKey={apiKey}
            onSelect={(place) => {
              handlePlace(place)
              map.setView([place.lat, place.lng], Math.max(map.getZoom(), 15))
            }}
          />
        )}
      </div>
      {hasValue ? (
        <Stack space={2}>
          <Flex align="center" gap={2}>
            <Text size={1} muted style={{flex: 1}}>
              {/* Primary line mirrors what the site renders as the Maps link text. */}
              {formattedAddress || `${lat.toFixed(6)}, ${lng.toFixed(6)}`}
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
          Click the map or search to set the location
        </Text>
      )}
    </Stack>
  )
}
