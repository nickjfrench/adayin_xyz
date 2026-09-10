import {useCallback, useEffect, useRef} from 'react'
import {ObjectInputProps, set, setIfMissing, unset} from 'sanity'
import {Button, Flex, Stack, Text} from '@sanity/ui'
import {TrashIcon} from '@sanity/icons/Trash'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {useLeafletMap} from './useLeafletMap'
import {createDotIcon} from './shapes'
import {PlacesSearch} from './googlePlaces'
import {DEFAULT_CENTER, DEFAULT_ZOOM, VALUE_ZOOM} from './leafletConfig'
import './mapInput.css'

/**
 * Interactive point input replacing the raw lat/lng fields for all geopoint
 * fields. Patch shape copies @sanity/google-maps-input's GeopointInput.
 */
export function LeafletGeopointInput(props: ObjectInputProps & {apiKey?: string}) {
  const {value, onChange, schemaType, readOnly, apiKey} = props
  const containerRef = useRef<HTMLDivElement | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const hasValue = value?.lat != null && value?.lng != null

  const map = useLeafletMap(
    containerRef,
    hasValue ? [value.lat, value.lng] : DEFAULT_CENTER,
    hasValue ? VALUE_ZOOM : DEFAULT_ZOOM,
  )

  const handleSet = useCallback(
    (latLng: {lat: number; lng: number}) => {
      onChange([setIfMissing({_type: schemaType.name}), set(latLng.lat, ['lat']), set(latLng.lng, ['lng'])])
    },
    [onChange, schemaType],
  )

  // Map click sets a pin only when none exists yet (prevents accidental moves).
  useEffect(() => {
    if (!map) return
    const onClick = (e: L.LeafletMouseEvent) => {
      if (!readOnly && !hasValue) handleSet({lat: e.latlng.lat, lng: e.latlng.lng})
    }
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
    }
  }, [map, readOnly, hasValue, handleSet])

  // Keep the marker in sync with the value: create on first value, reposition
  // on external changes (undo/paste). Dragend already matches the new value,
  // so the position comparison skips panning while the user drags.
  useEffect(() => {
    if (!map) return
    const lat = value?.lat
    const lng = value?.lng
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
        handleSet({lat: p.lat, lng: p.lng})
      })
      markerRef.current = m
    } else if (marker.getLatLng().lat !== lat || marker.getLatLng().lng !== lng) {
      marker.setLatLng([lat, lng])
      map.setView([lat, lng], map.getZoom())
    }
  }, [map, value?.lat, value?.lng, readOnly, handleSet])

  return (
    <Stack space={2}>
      <div ref={containerRef} className="leaflet-input-map">
        {apiKey && map && (
          <PlacesSearch
            apiKey={apiKey}
            onSelect={(latLng) => {
              handleSet(latLng)
              map.setView([latLng.lat, latLng.lng], Math.max(map.getZoom(), 15))
            }}
          />
        )}
      </div>
      {hasValue ? (
        <Flex align="center" gap={2}>
          <Text size={1} muted style={{flex: 1}}>
            {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
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
      ) : (
        <Text size={1} muted>
          Click the map or search to set the location
        </Text>
      )}
    </Stack>
  )
}
