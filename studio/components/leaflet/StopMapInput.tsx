import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react'
import {createPortal} from 'react-dom'
import {FormPatch, ObjectInputProps, set, setIfMissing, unset} from 'sanity'
import {Button, Flex, Grid, Stack, Text, TextInput} from '@sanity/ui'
import {CollapseIcon} from '@sanity/icons/Collapse'
import {ExpandIcon} from '@sanity/icons/Expand'
import {TrashIcon} from '@sanity/icons/Trash'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import 'leaflet/dist/leaflet.css'
import {useLeafletMap} from './useLeafletMap'
import {SHAPE_DEFS, shapeFromLayer, type MapFeatureItem} from './shapes'
import {dotIcon, featureBounds} from '@adayin/map-core'
import {mapsQueryUrl} from '@adayin/map-core/core'
import {PlacesSearch, type SelectedPlace} from './googlePlaces'
import {DEFAULT_CENTER, DEFAULT_ZOOM, PIN_COLOR, POINT_COLOR, VALUE_ZOOM} from './leafletConfig'
import {LeafletLocationInput} from './LeafletLocationInput'
import './mapInput.css'

interface StopMapContextValue {
  docOnChange: (patch: FormPatch | FormPatch[]) => void
  features: MapFeatureItem[]
}

/**
 * Provided by StopMapDocumentInput around the whole stop form. The location
 * field's input detects it to switch to the combined pin+region map; regions
 * are patched at document level because they live in the sibling mapFeatures
 * field.
 */
const StopMapContext = createContext<StopMapContextValue | null>(null)

function useStopMap(): StopMapContextValue {
  const ctx = useContext(StopMapContext)
  if (!ctx) throw new Error('StopMapFieldInput requires the leafletMapInput plugin')
  return ctx
}

/** Document-level input for stops: provides the context the combined map reads. */
export function StopMapDocumentInput(props: ObjectInputProps) {
  const ctx = useMemo(() => {
    const value = props.value as {mapFeatures?: unknown} | undefined
    const features = Array.isArray(value?.mapFeatures)
      ? (value!.mapFeatures as MapFeatureItem[])
      : []
    return {docOnChange: props.onChange, features}
  }, [props.onChange, props.value])
  return <StopMapContext.Provider value={ctx}>{props.renderDefault(props)}</StopMapContext.Provider>
}

/**
 * Router for location-typed inputs: inside a stop the field hosts the combined
 * pin+region map; everywhere else (travel, start/end location) the plain pin
 * editor.
 */
export function LocationInput(props: ObjectInputProps & {apiKey?: string}) {
  const ctx = useContext(StopMapContext)
  return ctx ? <StopMapFieldInput {...props} /> : <LeafletLocationInput {...props} />
}

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
  // Text markers carry their content as label — required so the pm:edit
  // merge (syncFromLayer) picks up Geoman inline text edits.
  if (geom.label) stored.label = geom.label
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

/** True while any Geoman mode is active — map clicks belong to it, not the pin. */
function geomanBusy(map: L.Map): boolean {
  return (
    map.pm.globalDrawModeEnabled() ||
    map.pm.globalEditModeEnabled() ||
    map.pm.globalDragModeEnabled() ||
    map.pm.globalRemovalModeEnabled()
  )
}

/**
 * Combined stop map: the pin editor (LeafletLocationInput behavior) and the
 * Geoman region editor share one Leaflet map. The pin lives in this field's
 * value; regions live in the sibling mapFeatures field and are patched at
 * document level via the context.
 */
export function StopMapFieldInput(props: ObjectInputProps & {apiKey?: string}) {
  const {value, onChange, schemaType, readOnly, apiKey} = props
  const {docOnChange, features} = useStopMap()
  const items = features
  const keyMapRef = useRef(new Map<string, L.Layer>())
  const markerRef = useRef<L.Marker | null>(null)
  const lastEmittedRef = useRef<string | null>(null)
  if (lastEmittedRef.current === null) lastEmittedRef.current = sig(items)

  const lat = value?.lat
  const lng = value?.lng
  const formattedAddress = value?.formattedAddress
  const hasValue = lat != null && lng != null
  const {setContainer, map} = useLeafletMap(DEFAULT_CENTER, DEFAULT_ZOOM)

  // Latest values for event handlers; avoids stale closures between renders.
  const valueRef = useRef(items)
  valueRef.current = items
  const pinRef = useRef<{lat: number; lng: number} | null>(null)
  pinRef.current = hasValue ? {lat, lng} : null

  const emit = useCallback(
    (next: MapFeatureItem[]) => {
      valueRef.current = next
      lastEmittedRef.current = sig(next)
      docOnChange(set(next, ['mapFeatures']))
    },
    [docOnChange],
  )
  // Event closures (geoman layer handlers, marker dragend) read these refs so
  // they never capture a stale emit/docOnChange from an earlier render.
  const emitRef = useRef(emit)
  emitRef.current = emit
  const docOnChangeRef = useRef(docOnChange)
  docOnChangeRef.current = docOnChange

  /**
   * Wires the pm:update/pm:edit/pm:dragend/pm:remove sync handlers onto a
   * layer. Used both by redraws (addLayerFor) and freshly drawn layers
   * (onCreate), so edits on brand-new shapes persist without a redraw.
   */
  const attachLayerHandlers = useCallback((layer: L.Layer, item: MapFeatureItem) => {
    const syncFromLayer = () => {
      const updated = itemFromLayer(layer, item._key)
      if (updated)
        emitRef.current(
          valueRef.current.map((i) => (i._key === item._key ? {...i, ...updated} : i)),
        )
    }
    const onLayerRemove = () => {
      keyMapRef.current.delete(item._key)
      const next = valueRef.current.filter((i) => i._key !== item._key)
      valueRef.current = next
      lastEmittedRef.current = sig(next)
      docOnChangeRef.current(unset(['mapFeatures', {_key: item._key}]))
    }
    layer.on('pm:update', syncFromLayer)
    layer.on('pm:edit', syncFromLayer)
    layer.on('pm:dragend', syncFromLayer)
    layer.on('pm:remove', onLayerRemove)
  }, [])

  const addLayerFor = useCallback(
    (item: MapFeatureItem) => {
      if (!map) return
      const def = SHAPE_DEFS[item.shape]
      if (!def) return
      const layer = def.layerFromFeature(item)
      if (!layer) return
      if (item.label && item.shape !== 'text') layer.bindTooltip(item.label)
      keyMapRef.current.set(item._key, layer)
      layer.addTo(map)
      attachLayerHandlers(layer, item)
    },
    [map, attachLayerHandlers],
  )

  // List-driven removal: external map.removeLayer does NOT fire pm:remove
  // (only Geoman's removal tool does), so this emits the unset itself.
  // Geoman-tool removals arrive via the layer's own onLayerRemove instead.
  const removeItem = (key: string) => {
    const layer = keyMapRef.current.get(key)
    keyMapRef.current.delete(key)
    if (layer && map) map.removeLayer(layer)
    const next = valueRef.current.filter((i) => i._key !== key)
    valueRef.current = next
    lastEmittedRef.current = sig(next)
    docOnChange(unset(['mapFeatures', {_key: key}]))
  }
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

  // Search destination choices: set the stop location, or append a point
  // feature (repeated picks accumulate). The place's displayName — the
  // searched thing's own name, e.g. a viewpoint inside a park — seeds the
  // label; formattedAddress is often just the enclosing park's address.
  // Editable in the feature list afterwards.
  const searchActions = useMemo(
    () =>
      apiKey && map && !readOnly
        ? [
            {
              label: 'Set as stop location',
              onPick: (place: SelectedPlace) => {
                handlePlace(place)
                map.setView([place.lat, place.lng], Math.max(map.getZoom(), 15))
              },
            },
            {
              label: 'Add as map point',
              onPick: (place: SelectedPlace) => {
                const item: MapFeatureItem = {
                  _key: crypto.randomUUID(),
                  _type: 'mapFeature',
                  shape: 'point',
                  label: place.displayName ?? place.formattedAddress ?? undefined,
                  position: {lat: place.lat, lng: place.lng},
                }
                emit([...valueRef.current, item])
                addLayerFor(item)
                map.setView([place.lat, place.lng], Math.max(map.getZoom(), 15))
              },
            },
          ]
        : [],
    [apiKey, map, readOnly, handlePlace, emit, addLayerFor],
  )

  // Map click sets a pin only when none exists yet (prevents accidental moves)
  // and no Geoman tool is active (draw clicks must not drop a pin mid-region).
  useEffect(() => {
    if (!map) return
    const onClick = (e: L.LeafletMouseEvent) => {
      if (!readOnly && !hasValue && !geomanBusy(map))
        handlePin({lat: e.latlng.lat, lng: e.latlng.lng})
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
    // A marker ref can be stale (leftover from a destroyed map instance after
    // a portal-toggle remount) or misconfigured (readOnly flipped since
    // creation froze `draggable`) — drop it so the branch below rebuilds it.
    if (
      markerRef.current &&
      (!map.hasLayer(markerRef.current) || markerRef.current.options.draggable === readOnly)
    ) {
      map.removeLayer(markerRef.current)
      markerRef.current = null
    }
    const marker = markerRef.current
    if (!marker) {
      const m = L.marker([lat, lng], {icon: dotIcon(16, PIN_COLOR), draggable: !readOnly}).addTo(map)
      m.on('dragend', () => {
        const p = m.getLatLng()
        handlePinRef.current({lat: p.lat, lng: p.lng})
      })
      markerRef.current = m
    } else if (marker.getLatLng().lat !== lat || marker.getLatLng().lng !== lng) {
      marker.setLatLng([lat, lng])
      map.setView([lat, lng], map.getZoom())
    }
  }, [map, lat, lng, readOnly, handlePin])

  // One-time setup: geoman controls, draw dispatch, initial view and layers.
  useEffect(() => {
    if (!map) return
    const keyMap = keyMapRef.current

    if (!readOnly) {
      map.pm.addControls({
        position: 'topright',
        drawMarker: true,
        drawPolygon: true,
        drawCircle: true,
        drawCircleMarker: false,
        drawPolyline: false,
        drawRectangle: false,
        drawText: false,
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
      // Geoman drops a default blue pin for markers — restyle points to the
      // amber feature dot.
      if (item.shape === 'point') (e.layer as L.Marker).setIcon(dotIcon(12, POINT_COLOR))
      keyMap.set(item._key, e.layer)
      emitRef.current([...valueRef.current, item])
      // Geoman already put the layer on the map; wiring handlers here makes
      // edits/drags/removals on brand-new shapes persist without a redraw.
      attachLayerHandlers(e.layer, item)
    }
    map.on('pm:create', onCreate)

    // Initial view: frame pin + regions together, else center on the pin,
    // else the world default the map was constructed with.
    const corners: L.LatLngExpression[] = []
    const pin = pinRef.current
    if (pin) corners.push([pin.lat, pin.lng])
    valueRef.current.forEach((f) => {
      const b = featureBounds(f)
      if (b) corners.push(b.getSouthWest(), b.getNorthEast())
    })
    if (corners.length > 1) map.fitBounds(L.latLngBounds(corners), {padding: [20, 20], maxZoom: 16})
    else if (pin) map.setView([pin.lat, pin.lng], VALUE_ZOOM)

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
  }, [map, readOnly, addLayerFor, attachLayerHandlers])

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

  // Per-keystroke label edit: patches only this member's label so sibling
  // features aren't rewritten. Bookkeeping updates the refs so the redraw
  // effect treats it as our own emission (no-op), like emit does.
  const setLabel = (key: string, label: string) => {
    const next = valueRef.current.map((i) =>
      i._key === key ? {...i, label: label || undefined} : i,
    )
    valueRef.current = next
    lastEmittedRef.current = sig(next)
    docOnChange(
      label
        ? set(label, ['mapFeatures', {_key: key}, 'label'])
        : unset(['mapFeatures', {_key: key}, 'label']),
    )
    const layer = keyMapRef.current.get(key)
    const shape = valueRef.current.find((i) => i._key === key)?.shape
    if (layer && shape === 'text') {
      // Text markers render their label inline — push the list edit into the
      // Geoman text area so the marker shows the stored content. Geoman's
      // setText skips empty values, so clear the textarea directly then.
      const pm = (layer as unknown as {pm?: {setText?: (t: string) => void}}).pm
      pm?.setText?.(label)
      const el = (layer as L.Marker).getElement()?.querySelector('textarea')
      if (el && el.value !== label) {
        el.value = label
        ;(pm as {_autoResize?: () => void} | undefined)?._autoResize?.()
      }
    } else if (layer) {
      // Area shapes carry a Leaflet tooltip; text markers render their label.
      if (label) layer.bindTooltip(label)
      else layer.unbindTooltip()
    }
  }

  // The fullscreen overlay portals to document.body: fixed positioning inside
  // the studio form can be hijacked by transformed/contained ancestors and
  // loses the stacking war with studio chrome. Portalling remounts the map
  // node (useLeafletMap rebuilds the instance; layers refit from the value).
  const mapNode = (
    <div
      ref={setContainer}
      className={expanded ? 'leaflet-input-map leaflet-input-expanded' : 'leaflet-input-map'}
    >
      {apiKey && map && <PlacesSearch apiKey={apiKey} map={map} actions={searchActions} />}
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
          Click the map or search to set the pin — drag the pin to move it. Draw a polygon or circle
          to add a clickable region.
        </Text>
      )}
      {items.length === 0 ? (
        <Text size={1} muted>
          Draw a polygon or circle to define a clickable region — label it to list it as an option.
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
