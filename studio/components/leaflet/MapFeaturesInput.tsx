import {useCallback, useEffect, useRef} from 'react'
import {ArrayOfObjectsInputProps, set} from 'sanity'
import {Button, Grid, Stack, Text, TextInput} from '@sanity/ui'
import {TrashIcon} from '@sanity/icons/Trash'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import 'leaflet/dist/leaflet.css'
import {useLeafletMap} from './useLeafletMap'
import {SHAPE_DEFS, createDotIcon, shapeFromLayer, type MapFeatureItem} from './shapes'
import {PlacesSearch} from './googlePlaces'
import {DEFAULT_CENTER, DEFAULT_ZOOM} from './leafletConfig'
import './mapInput.css'

// Signature over geometry + labels only (storage keys of points members are
// regenerated on every geometry patch and must not trigger redraws).
const sig = (items: MapFeatureItem[]) =>
  JSON.stringify(
    items.map((i) => [
      i._key,
      i.label ?? null,
      i.shape,
      i.position?.lat ?? null,
      i.position?.lng ?? null,
      i.radius ?? null,
      (i.points ?? []).map((p) => [p.lat, p.lng]),
    ]),
  )

/** Builds a storable item from a drawn/edited layer via the shape registry. */
function itemFromLayer(layer: L.Layer, key: string): MapFeatureItem | null {
  const def = shapeFromLayer(layer)
  if (!def) return null
  const geom = def.featureFromLayer(layer)
  if (!geom) return null
  const stored: Record<string, unknown> = {_key: key, _type: 'mapFeature', shape: geom.shape}
  if (geom.position) stored.position = {_type: 'geopoint', ...geom.position}
  if (typeof geom.radius === 'number') stored.radius = geom.radius
  if (geom.points?.length) {
    stored.points = geom.points.map((p) => ({
      _key: crypto.randomUUID(),
      _type: 'geopoint',
      lat: p.lat,
      lng: p.lng,
    }))
  }
  return stored as unknown as MapFeatureItem // geometry fields are built dynamically above
}

/**
 * Geoman shape editor fully replacing the default array form — drawing IS
 * adding. All geometry flows through the shape registry; patches are
 * wholesale array sets computed from props.value.
 */
export function MapFeaturesInput(props: ArrayOfObjectsInputProps & {apiKey?: string}) {
  const {onChange, readOnly, apiKey} = props
  const items = Array.isArray(props.value) ? (props.value as MapFeatureItem[]) : []
  const containerRef = useRef<HTMLDivElement | null>(null)
  const keyMapRef = useRef(new Map<string, L.Layer>())
  const lastEmittedRef = useRef<string | null>(null)
  if (lastEmittedRef.current === null) lastEmittedRef.current = sig(items)

  const map = useLeafletMap(containerRef, DEFAULT_CENTER, DEFAULT_ZOOM)

  // Latest value for event handlers; avoids stale closures between renders.
  const valueRef = useRef(items)
  valueRef.current = items

  const emit = useCallback(
    (next: MapFeatureItem[]) => {
      valueRef.current = next
      lastEmittedRef.current = sig(next)
      onChange(set(next))
    },
    [onChange],
  )

  const addLayerFor = useCallback(
    (item: MapFeatureItem) => {
      if (!map) return
      const def = SHAPE_DEFS[item.shape]
      if (!def) return
      const layer = def.layerFromFeature(item)
      if (!layer) return
      if (item.label) layer.bindTooltip(item.label)
      keyMapRef.current.set(item._key, layer)
      layer.addTo(map)

      // pm:update fires when edit mode closes on a changed layer, pm:edit on
      // discrete vertex changes, pm:dragend after drag-mode drags. All rebuild
      // the item from the layer's current geometry.
      const syncFromLayer = () => {
        const updated = itemFromLayer(layer, item._key)
        if (updated)
          emit(valueRef.current.map((i) => (i._key === item._key ? {...i, ...updated} : i)))
      }
      const onLayerRemove = () => {
        keyMapRef.current.delete(item._key)
        emit(valueRef.current.filter((i) => i._key !== item._key))
      }
      layer.on('pm:update', syncFromLayer)
      layer.on('pm:edit', syncFromLayer)
      layer.on('pm:dragend', syncFromLayer)
      layer.on('pm:remove', onLayerRemove)
    },
    [map, emit],
  )

  // One-time setup: geoman controls, draw dispatch, initial view and layers.
  useEffect(() => {
    if (!map) return
    const keyMap = keyMapRef.current

    if (!readOnly) {
      map.pm.addControls({
        position: 'topright',
        drawMarker: true,
        drawPolygon: true,
        drawPolyline: true,
        drawCircle: true,
        drawRectangle: false,
        drawCircleMarker: false,
        editMode: true,
        dragMode: true,
        removalMode: true,
        cutPolygon: false,
        rotateMode: false,
      })
    }

    const onCreate: L.PM.CreateEventHandler = (e) => {
      const item = itemFromLayer(e.layer, crypto.randomUUID())
      if (!item) return
      if (item.shape === 'point' && e.layer instanceof L.Marker) e.layer.setIcon(createDotIcon(16))
      keyMap.set(item._key, e.layer)
      emit([...valueRef.current, item])
    }
    map.on('pm:create', onCreate)

    // Initial view: frame existing geometry, else the world default.
    const corners: L.LatLngExpression[] = []
    valueRef.current.forEach((f) => {
      const b = SHAPE_DEFS[f.shape]?.boundsOf(f)
      if (b) corners.push(b.getSouthWest(), b.getNorthEast())
    })
    if (corners.length > 0) map.fitBounds(L.latLngBounds(corners), {padding: [20, 20], maxZoom: 16})

    valueRef.current.forEach(addLayerFor)

    return () => {
      map.off('pm:create', onCreate)
      // Layers belong to this map instance — dropping them here keeps effect
      // re-runs (readOnly flips) and StrictMode remounts from leaving
      // duplicate layers or orphans keyMap can no longer address.
      keyMap.forEach((layer) => map.removeLayer(layer))
      keyMap.clear()
      if (!readOnly) map.pm.removeControls()
    }
  }, [map, readOnly, emit, addLayerFor])

  // External value changes (undo, collaborative edits): redraw everything.
  // Local emissions keep sig equal, so this is a no-op for our own patches.
  useEffect(() => {
    if (!map) return
    const s = sig(items)
    if (s === lastEmittedRef.current) return
    const keyMap = keyMapRef.current
    keyMap.forEach((layer) => map.removeLayer(layer))
    keyMap.clear()
    items.forEach(addLayerFor)
    lastEmittedRef.current = s
  }, [map, items, addLayerFor])

  const setLabel = (key: string, label: string) => {
    emit(valueRef.current.map((i) => (i._key === key ? {...i, label: label || undefined} : i)))
    const layer = keyMapRef.current.get(key)
    if (layer) {
      if (label) layer.bindTooltip(label)
      else layer.unbindTooltip()
    }
  }

  const removeItem = (key: string) => {
    const layer = keyMapRef.current.get(key)
    keyMapRef.current.delete(key)
    if (layer) map?.removeLayer(layer)
    emit(valueRef.current.filter((i) => i._key !== key))
  }

  return (
    <Stack space={2}>
      <div ref={containerRef} className="leaflet-input-map">
        {apiKey && map && (
          <PlacesSearch
            apiKey={apiKey}
            onSelect={(latLng) =>
              map.setView([latLng.lat, latLng.lng], Math.max(map.getZoom(), 15))
            }
          />
        )}
      </div>
      {items.length === 0 ? (
        <Text size={1} muted>
          Draw a point, line, polygon, or circle to mark where this stop happens — label a feature
          to list it as an option.
        </Text>
      ) : (
        <Stack space={2} padding={1}>
          {items.map((item) => (
            <Grid key={item._key} columns={3} gap={2}>
              <Text size={2} style={{textAlign: 'center'}} title={item.shape}>
                {SHAPE_DEFS[item.shape]?.glyph ?? '•'}
              </Text>
              <TextInput
                value={item.label ?? ''}
                placeholder="Option or area name (optional)"
                readOnly={readOnly}
                onChange={(e) => setLabel(item._key, e.currentTarget.value)}
              />
              <Button
                aria-label="Remove feature"
                icon={TrashIcon}
                mode="ghost"
                tone="critical"
                disabled={readOnly}
                onClick={() => removeItem(item._key)}
              />
            </Grid>
          ))}
        </Stack>
      )}
    </Stack>
  )
}
