import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FormPatch, ObjectInputProps, set, setIfMissing, unset } from 'sanity'
import { Button, Flex, Grid, Stack, Text, TextInput } from '@sanity/ui'
import { CollapseIcon } from '@sanity/icons/Collapse'
import { ExpandIcon } from '@sanity/icons/Expand'
import { TrashIcon } from '@sanity/icons/Trash'
import {
 FEATURE_ID_PROPERTY,
 Geoman,
 type FeatureCreatedFwdEvent,
 type FeatureData,
 type FeatureEditEndFwdEvent,
 type FeatureRemovedFwdEvent,
} from '@geoman-io/maplibre-geoman-free'
import '@geoman-io/maplibre-geoman-free/dist/maplibre-geoman.css'
import {
 LngLatBounds,
 Map as MapLibreMap,
 Marker,
 Popup,
 type FitBoundsOptions,
 type LngLatBoundsLike,
 type MapMouseEvent,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { mapFeatureBounds, mapFeaturesSignature, mapsQueryUrl } from '@adayin/map-core/core'
import { dotElement, flashPin, tooltipText } from '@adayin/map-core/dom'
import { useMapLibreMap } from './useMapLibreMap'
import { LocationInput } from './LocationInput'
import {
 featureLabel,
 importFeatures,
 itemFromFeature,
 mergedItem,
 SHAPE_GLYPHS,
 type MapFeatureItem,
} from './shapes'
import { PlacesSearch, mapViewport, shieldMapElement, type SelectedPlace } from './googlePlaces'
import {
 DEFAULT_CENTER,
 DEFAULT_ZOOM,
 MARKER_HEAD_RADIUS,
 MARKER_HEAD_UP,
 MARKER_HEIGHT,
 MARKER_TAIL_EXPONENT,
 PIN_COLOR,
 PIN_FLASH,
 VALUE_ZOOM,
} from './mapConfig'
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
 if (!ctx) throw new Error('StopMapFieldInput requires the map-input plugin')
 return ctx
}

/** Document-level input for stops: provides the context the combined map reads. */
export function StopMapDocumentInput(props: ObjectInputProps) {
 const ctx = useMemo(() => {
  const value = props.value as { mapFeatures?: unknown } | undefined
  const features = Array.isArray(value?.mapFeatures)
   ? (value!.mapFeatures as MapFeatureItem[])
   : []
  return { docOnChange: props.onChange, features }
 }, [props.onChange, props.value])
 return <StopMapContext.Provider value={ctx}>{props.renderDefault(props)}</StopMapContext.Provider>
}

/**
 * Router for location-typed inputs: inside a stop the field hosts the combined
 * pin+region map; everywhere else (travel, start/end location) the plain pin
 * editor.
 */
export function LocationFieldInput(props: ObjectInputProps & { apiKey?: string }) {
 const ctx = useContext(StopMapContext)
 return ctx ? <StopMapFieldInput {...props} /> : <LocationInput {...props} />
}

// Signature over geometry + labels only (storage keys of points members are
// regenerated on every geometry patch and must not trigger redraws).
const sig = mapFeaturesSignature

/**
 * The Geoman toolbar policy: exactly the tools the studio has always offered —
 * marker, polygon and circle drawing plus change, drag and delete — with every
 * other mode Geoman enables by default switched off. The toolbar itself is
 * always constructed (`useControlsUi: true`): Geoman freezes that setting at
 * construction and only its addControls/removeControls cycle can toggle it
 * later, so read-only hides it in CSS instead and the editor instance never
 * has to be rebuilt.
 */
function gmOptions() {
 return {
  settings: {
   useControlsUi: true,
   controlsPosition: 'top-right' as const,
   controlsUiEnabledByDefault: true,
   controlsCollapsible: false,
  },
  controls: {
   draw: {
    marker: { uiEnabled: true },
    polygon: { uiEnabled: true },
    circle: { uiEnabled: true },
    text_marker: { uiEnabled: false },
    circle_marker: { uiEnabled: false },
    ellipse: { uiEnabled: false },
    line: { uiEnabled: false },
    rectangle: { uiEnabled: false },
   },
   edit: {
    change: { uiEnabled: true },
    drag: { uiEnabled: true },
    delete: { uiEnabled: true },
    rotate: { uiEnabled: false },
    cut: { uiEnabled: false },
   },
   helper: {
    snapping: { uiEnabled: false },
    zoom_to_features: { uiEnabled: false },
   },
  },
 }
}

/** True while a Geoman tool owns the map — map clicks belong to it, not the pin. */
function geomanBusy(geoman: Geoman | null): boolean {
 if (!geoman) return false
 return geoman.getActiveDrawModes().length > 0 || geoman.getActiveEditModes().length > 0
}

/** The stored key of a Geoman feature: ours once written, the feature's id before that. */
function featureKey(feature: FeatureData): string {
 const key = feature.getGeoJson().properties?._key
 return typeof key === 'string' ? key : String(feature.id)
}

/** Looks a feature up by its stored key. */
function featureByKey(geoman: Geoman, key: string): FeatureData | null {
 for (const feature of geoman.features.featureStore.values()) {
  if (featureKey(feature) === key) return feature
 }
 return null
}

/**
 * The map's opening camera: frame pin + regions together when anything is
 * stored, else zoom to the pin. Applied through the constructor so the editor
 * is never seen at the world view before it frames its content.
 */
function initialBounds(
 items: MapFeatureItem[],
 pin: { lat: number; lng: number } | null,
): { bounds: LngLatBoundsLike; fitBoundsOptions: FitBoundsOptions } | undefined {
 const corners: [number, number][] = []
 if (pin) corners.push([pin.lng, pin.lat])
 items.forEach((item) => {
  const bounds = mapFeatureBounds(item)
  if (bounds) corners.push([bounds.west, bounds.south], [bounds.east, bounds.north])
 })
 if (corners.length === 0) return undefined
 const bounds = new LngLatBounds(corners[0], corners[0])
 corners.forEach((corner) => bounds.extend(corner))
 return { bounds, fitBoundsOptions: { padding: 20, maxZoom: VALUE_ZOOM } }
}

/**
 * Combined stop map: the pin editor (LocationInput behavior) and the region
 * editor share one MapLibre map. The pin is a DOM marker this field owns end to
 * end; regions live in the sibling mapFeatures field, are drawn and edited by
 * Geoman, and are patched at document level via the context.
 */
export function StopMapFieldInput(props: ObjectInputProps & { apiKey?: string }) {
 const { value, onChange, schemaType, readOnly, apiKey } = props
 const { docOnChange, features } = useStopMap()
 const items = features
 const markerRef = useRef<{ marker: Marker; map: MapLibreMap } | null>(null)
 const geomanRef = useRef<Geoman | null>(null)
 /** Pending teardown: the next Geoman instance waits for the previous one's sources. */
 const teardownRef = useRef<Promise<void> | null>(null)
 const lastEmittedRef = useRef<string | null>(null)
 if (lastEmittedRef.current === null) lastEmittedRef.current = sig(items)

 const lat = value?.lat
 const lng = value?.lng
 const formattedAddress = value?.formattedAddress
 const hasValue = lat != null && lng != null
 // Initial camera: frame pin + regions at construction (the constructor fits
 // bounds instantly), so the editor never loads onto the world view and then
 // zooms in. Nothing stored → the world default the hook builds with.
 const { setContainer, map } = useMapLibreMap(DEFAULT_CENTER, DEFAULT_ZOOM, initialBounds(items, hasValue ? { lat, lng } : null))
 const viewport = useMemo(() => (map ? mapViewport(map) : null), [map])

 // Latest values for event handlers; avoids stale closures between renders.
 const valueRef = useRef(items)
 valueRef.current = items

 const emit = useCallback(
  (next: MapFeatureItem[]) => {
   valueRef.current = next
   lastEmittedRef.current = sig(next)
   docOnChange(set(next, ['mapFeatures']))
  },
  [docOnChange],
 )
 // Event closures (Geoman handlers, marker dragend) read these refs so they
 // never capture a stale emit/docOnChange from an earlier render.
 const emitRef = useRef(emit)
 emitRef.current = emit
 const docOnChangeRef = useRef(docOnChange)

 docOnChangeRef.current = docOnChange
 // Read-only flips at publish boundaries; event handlers read it at event
 // time so they never capture a stale flag.
 const readOnlyRef = useRef(readOnly)
 readOnlyRef.current = readOnly
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
  (pin: { lat: number; lng: number }) => {
   const patches: FormPatch[] = [
    setIfMissing({ _type: schemaType.name }),
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
    setIfMissing({ _type: schemaType.name }),
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

 // One Geoman instance per MAP, never per read-only state: the editor is
 // destroyed only when the map itself goes away. Read-only (published
 // documents) hides the toolbar via a container attribute instead of
 // re-creating the instance — a destroy/re-create cycle would drop the drawn
 // features on every publish and races its own teardown chain.
 useEffect(() => {
  if (!map) return
  let cancelled = false
  let session: { geoman: Geoman; dispose: () => void } | null = null
  const previous = teardownRef.current ?? Promise.resolve()
  const setup = async () => {
   let instance: Geoman | null = null
   try {
    if (cancelled) return
    const geoman = new Geoman(map, gmOptions())
    instance = geoman
    const onCreated = async (event: FeatureCreatedFwdEvent) => {
     if (readOnlyRef.current) return
     // New features carry our own key, so every stored member has one.
     const key = crypto.randomUUID()
     await event.feature.updateProperties({ _key: key })
     const item = itemFromFeature(event.feature, key)
     if (item) emitRef.current([...valueRef.current, item])
     // One shape per toolbar press, as the studio's draw modes have always
     // worked: Geoman otherwise keeps drawing until the button is pressed again.
     await geoman.disableDraw()
    }
    // Only the settled events patch: the high-frequency drag/edit streams
    // would rewrite the document on every mouse move.
    const onEdited = (event: FeatureEditEndFwdEvent) => {
     if (readOnlyRef.current) return
     const key = featureKey(event.feature)
     const existing = valueRef.current.find((i) => i._key === key)
     if (!existing) return
     const next = mergedItem(event.feature, existing)
     if (next) emitRef.current(valueRef.current.map((i) => (i._key === key ? next : i)))
    }
    const onRemoved = (event: FeatureRemovedFwdEvent) => {
     if (readOnlyRef.current) return
     const key = featureKey(event.feature)
     const next = valueRef.current.filter((i) => i._key !== key)
     valueRef.current = next
     lastEmittedRef.current = sig(next)
     docOnChangeRef.current(unset(['mapFeatures', { _key: key }]))
    }
    geoman.mapAdapter.on<'gm:create'>('gm:create', onCreated)
    geoman.mapAdapter.on<'gm:editend'>('gm:editend', onEdited)
    geoman.mapAdapter.on<'gm:dragend'>('gm:dragend', onEdited)
    geoman.mapAdapter.on<'gm:remove'>('gm:remove', onRemoved)
    session = {
     geoman,
     dispose: () => {
      geoman.mapAdapter.off<'gm:create'>('gm:create', onCreated)
      geoman.mapAdapter.off<'gm:editend'>('gm:editend', onEdited)
      geoman.mapAdapter.off<'gm:dragend'>('gm:dragend', onEdited)
      geoman.mapAdapter.off<'gm:remove'>('gm:remove', onRemoved)
     },
    }
    geomanRef.current = geoman
    await geoman.waitForGeomanLoaded()
    if (cancelled) {
     // The effect was torn down while Geoman was still loading: release the
     // instance instead of leaving its sources and controls on a map that is
     // already on its way out.
     await geoman.destroy({ removeSources: true }).catch(() => { })
     return
    }
    // Stored items are imported once; from here Geoman owns their geometry.
    await importFeatures(geoman, valueRef.current)
    if (cancelled) return
   } catch (error) {
    // A teardown during load (unmount or portal toggle before the style
    // arrives) rejects mid-chain: release the half-initialised instance
    // quietly instead of surfacing an unhandled rejection for a map that
    // is already gone.
    if (cancelled) {
     await instance?.destroy({ removeSources: true }).catch(() => { })
    } else {
     console.error('[StopMapInput] Geoman setup failed', error)
    }
   }
  }
  void previous.then(setup)
  return () => {
   cancelled = true
   const geoman = session?.geoman ?? null
   session?.dispose()
   geomanRef.current = null
   teardownRef.current = geoman
    ? geoman.destroy({ removeSources: true }).catch(() => { })
    : Promise.resolve()
  }
 }, [map, importFeatures])

 // Map click sets a pin only when none exists yet (prevents accidental moves)
 // and no Geoman tool is active (draw clicks must not drop a pin mid-region).
 useEffect(() => {
  if (!map) return
  const onClick = (event: MapMouseEvent) => {
   if (!readOnly && !hasValue && !geomanBusy(geomanRef.current)) {
    handlePin({ lat: event.lngLat.lat, lng: event.lngLat.lng })
   }
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
   // A plain DOM marker outside Geoman's sources: the editor's tools cannot
   // select, edit or remove it, so the pin survives every draw and delete.
   const next = new Marker({
    element: dotElement(16, PIN_COLOR),
    anchor: 'center',
    draggable: !readOnly,
    // Same as LocationInput: without this the map's 20px click tolerance
    // eats drags shorter than 20px.
    clickTolerance: 3,
   })
    .setLngLat([lng, lat])
    .addTo(map)
   next.on('dragend', () => {
    const position = next.getLngLat()
    handlePinRef.current({ lat: position.lat, lng: position.lng })
   })
   markerRef.current = { marker: next, map }
  } else {
   marker.setDraggable(!readOnly)
   if (marker.getLngLat().lat !== lat || marker.getLngLat().lng !== lng) {
    marker.setLngLat([lng, lat])
    map.jumpTo({ center: [lng, lat], zoom: map.getZoom() })
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

 // External value changes (undo, collaborative edits): redraw the editor's
 // features. Local emissions keep sig equal, so this is a no-op for our own
 // patches.
 useEffect(() => {
  if (!map) return
  const s = sig(items)
  if (s === lastEmittedRef.current) return
  lastEmittedRef.current = s
  const geoman = geomanRef.current
  if (!geoman) return
  void geoman.features
   .deleteAll()
   .then(() => importFeatures(geoman, items))
   .catch((error: unknown) => console.error('[StopMapInput] feature redraw failed', error))
 }, [map, items])

/**
 * The Geoman feature drawn at a screen point, topmost first. Geoman's own
 * getFeatureByMouseEvent hit-tests a point feature on the marker layer's whole
 * icon box — a square wider than the drawn pin — so a point claims the pointer
 * from up to 18px away and shadows the region drawn beneath it. A point only
 * counts here when the pointer is on the drawn pin; every other shape keeps
 * MapLibre's own hit test (fills are exact, text boxes are the drawn text).
 */
function featureAt(
 geoman: Geoman,
 map: MapLibreMap,
 point: { x: number; y: number },
): FeatureData | null {
 const candidates: FeatureData[] = []
 for (const hit of map.queryRenderedFeatures([point.x, point.y])) {
  if (hit.source !== 'gm_main') continue
  const id = (hit.properties as Record<string, unknown>)[FEATURE_ID_PROPERTY]
  if (typeof id !== 'string' && typeof id !== 'number') continue
  const feature = geoman.features.get('gm_main', id)
  if (feature && !candidates.includes(feature)) candidates.push(feature)
 }
 // queryRenderedFeatures returns top-to-bottom draw order: the first feature
 // that is not an off-pin point is the one drawn under the pointer.
 return candidates.find((f) => f.shape !== 'marker' || onMarkerArt(map, f, point)) ?? null
}

/** True when a screen point is on a marker feature's drawn pin (see mapConfig). */
function onMarkerArt(
 map: MapLibreMap,
 feature: FeatureData,
 point: { x: number; y: number },
): boolean {
 const geometry = feature.getGeoJson().geometry
 if (geometry.type !== 'Point') return false
 const anchor = map.project(geometry.coordinates as [number, number])
 const dx = Math.abs(point.x - anchor.x)
 const up = anchor.y - point.y
 if (up < 0 || up > MARKER_HEIGHT) return false
 const half =
  up <= MARKER_HEAD_UP
   ? MARKER_HEAD_RADIUS * (up / MARKER_HEAD_UP) ** MARKER_TAIL_EXPONENT
   : Math.sqrt(MARKER_HEAD_RADIUS ** 2 - (up - MARKER_HEAD_UP) ** 2)
 return dx <= half
}

 // Feature hover labels: Geoman draws features onto the canvas, so the label
 // comes from a hit test on whatever sits under the pointer.
 useEffect(() => {
  if (!map) return
  const tooltip = new Popup({
   anchor: 'bottom',
   offset: 14,
   maxWidth: '14rem',
   closeButton: false,
   closeOnClick: false,
   className: 'map-input-tooltip',
  })
  let shown: { key: string; label: string } | null = null
  const onMove = (event: MapMouseEvent) => {
   const geoman = geomanRef.current
   const feature = geoman ? featureAt(geoman, map, event.point) : null
   const label = feature ? featureLabel(feature) : null
   if (!feature || !label) {
    if (shown) {
     tooltip.remove()
     shown = null
    }
    return
   }
   const key = String(feature.id)
   if (shown?.key === key && shown.label === label) {
    tooltip.setLngLat(event.lngLat)
    return
   }
   shown = { key, label }
   tooltip.setLngLat(event.lngLat).setDOMContent(tooltipText(label)).addTo(map)
  }
  map.on('mousemove', onMove)
  return () => {
   map.off('mousemove', onMove)
   tooltip.remove()
  }
 }, [map])

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

 // Search destination choices: set the stop location, or append a point
 // feature (repeated picks accumulate). The place's displayName — the
 // searched thing's own name, e.g. a viewpoint inside a park — seeds the
 // label; formattedAddress is often just the enclosing park's address.
 // Editable in the feature list afterwards.
 const searchActions = useMemo(
  () =>
   apiKey && map && viewport && !readOnly
    ? [
     {
      label: 'Set as stop location',
      onPick: (place: SelectedPlace) => {
       handlePlace(place)
       map.jumpTo({
        center: [place.lng, place.lat],
        zoom: Math.max(map.getZoom(), 15),
       })
       setFlashSeq((n) => n + 1)
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
        position: { lat: place.lat, lng: place.lng },
       }
       emit([...valueRef.current, item])
       const geoman = geomanRef.current
       if (geoman) void importFeatures(geoman, [item])
       map.jumpTo({
        center: [place.lng, place.lat],
        zoom: Math.max(map.getZoom(), 15),
       })
       // The feature is drawn on Geoman's canvas, so there is no element to
       // blink; a throwaway dot marks where it landed and removes itself when
       // the blink ends (a reduced-motion user gets no animation, so flashPin
       // is a no-op and the dot goes at once).
       const element = dotElement(16, PIN_COLOR)
       const flashMarker = new Marker({ element, anchor: 'center' })
        .setLngLat([place.lng, place.lat])
        .addTo(map)
       flashPin(element, PIN_FLASH)
       const [blink] = element.getAnimations()
       if (blink) void blink.finished.then(() => flashMarker.remove(), () => flashMarker.remove())
       else flashMarker.remove()
      },
     },
    ]
    : [],
  [apiKey, map, viewport, readOnly, handlePlace, emit],
 )

 // Per-keystroke label edit: patches only this member's label so sibling
 // features aren't rewritten. Bookkeeping updates the refs so the redraw
 // effect treats it as our own emission (no-op), like emit does.
 const setLabel = (key: string, label: string) => {
  const next = valueRef.current.map((i) =>
   i._key === key ? { ...i, label: label || undefined } : i,
  )
  valueRef.current = next
  lastEmittedRef.current = sig(next)
  docOnChange(
   label
    ? set(label, ['mapFeatures', { _key: key }, 'label'])
    : unset(['mapFeatures', { _key: key }, 'label']),
  )
  const geoman = geomanRef.current
  const feature = geoman ? featureByKey(geoman, key) : null
  if (!feature) return
  // The stored label rides along as a custom property for the list and the
  // tooltip; a text marker additionally renders `__gm_text`, which only
  // `setShapeProperty` writes through to the canvas.
  void feature.updateProperties({ label: label || undefined })
  if (feature.shape === 'text_marker') void feature.setShapeProperty('text', label)
 }

 // List-driven removal: Geoman's own removal tool fires gm:remove, so this
 // path emits the unset itself and takes the feature out of the editor.
 const removeItem = (key: string) => {
  const next = valueRef.current.filter((i) => i._key !== key)
  valueRef.current = next
  lastEmittedRef.current = sig(next)
  docOnChange(unset(['mapFeatures', { _key: key }]))
  const geoman = geomanRef.current
  if (geoman) {
   const feature = featureByKey(geoman, key)
   // features.delete wants the feature or its store id — not our _key,
   // which a drawn feature never adopts as its store id (it stays
   // `feature-N` even after updateProperties({_key})).
   if (feature) void geoman.features.delete(feature).catch(() => { })
  }
 }

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
 // node (useMapLibreMap rebuilds the instance; features refit from the value).
 const mapNode = (
  <div
   ref={setContainer}
   className={expanded ? 'map-input-map map-input-expanded' : 'map-input-map'}
   data-readonly={readOnly || undefined}
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
      <Text size={1} muted style={{ flex: 1 }}>
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
    <Stack gap={2} padding={1}>
     {items.map((item) => (
      <Grid key={item._key} gridTemplateColumns={3} gap={2}>
       <Text size={2} style={{ textAlign: 'center' }} title={item.shape}>
        {SHAPE_GLYPHS[item.shape] ?? '•'}
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
