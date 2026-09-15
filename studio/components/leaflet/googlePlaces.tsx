import {useEffect, useRef, useState} from 'react'
import L from 'leaflet'
import {Button} from '@sanity/ui'

let loader: Promise<void> | null = null

/** Loads the Google Places library once per session; rejects if the script errors. */
export function loadGooglePlaces(apiKey: string): Promise<void> {
  loader ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async&v=weekly`
    script.async = true
    script.addEventListener('load', () => resolve())
    script.addEventListener('error', () => {
      loader = null // transient script failure must not disable search for the session
      reject(new Error('Google Places failed to load'))
    })
    document.head.appendChild(script)
  })
  return loader
}

/** A place selected from autocomplete — the multipart payload for `location`. */
export interface SelectedPlace {
  lat: number
  lng: number
  formattedAddress: string | null
  displayName: string | null
  mapsUri: string | null
}

// Places caps a bias circle at 50 km; viewports below ~100 m are documented as
// too tight to be a useful hint, so the floor is a walkable kilometre.
const MIN_BIAS_RADIUS_M = 1000
const MAX_BIAS_RADIUS_M = 50_000

/**
 * Soft bias for the map's current view: predictions near its centre rank
 * first, matches further out still come back (locationBias, not
 * locationRestriction). The radius follows the viewport, so the hint tightens
 * as the editor zooms in.
 */
function viewportBias(map: L.Map): google.maps.CircleLiteral {
  const center = map.getCenter()
  const radius = map.distance(center, map.getBounds().getNorthEast())
  return {
    center: {lat: center.lat, lng: center.lng},
    radius: Math.min(MAX_BIAS_RADIUS_M, Math.max(MIN_BIAS_RADIUS_M, radius)),
  }
}

/**
 * Places autocomplete overlay for the map. Predictions are biased to whatever
 * the map currently shows — nearest first, nothing excluded. Renders nothing
 * on load failure — the map is unaffected. Wired like
 * @sanity/google-maps-input's SearchInput.
 */
export function PlacesSearch({
  apiKey,
  map,
  actions,
}: {
  apiKey: string
  /** Map the search overlays: its live centre and scale anchor predictions. */
  map: L.Map
  actions: Array<{label: string; onPick: (place: SelectedPlace) => void}>
}) {
  const [ready, setReady] = useState(false)
  // A selected place waiting for the user to pick a destination action.
  const [pending, setPending] = useState<SelectedPlace | null>(null)

  useEffect(() => {
    let cancelled = false
    loadGooglePlaces(apiKey)
      .then(() => {
        if (!cancelled) setReady(true)
      })
      .catch(() => {}) // no network / bad key → search hidden, map unaffected
    return () => {
      cancelled = true
    }
  }, [apiKey])
  // The search element sits inside the Leaflet map container: without this
  // shield, pointer events from the popup bubble into the map's drag/click
  // handlers, which light-dismiss the autocomplete before a click selects.
  const searchRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = searchRef.current
    if (el) {
      L.DomEvent.disableClickPropagation(el)
      L.DomEvent.disableScrollPropagation(el)
    }
  }, [ready])

  const pick = (place: SelectedPlace) => {
    // One action = no choice to make (standalone pin map): invoke directly.
    if (actions.length === 1) {
      actions[0].onPick(place)
      return
    }
    setPending(place)
  }

  // Escape dismisses the pending choice wherever focus sits.
  useEffect(() => {
    if (pending == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPending(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending])

  // The bias must be assigned through the DOM node: gmp-* tags are upgraded by
  // the places library, which loads asynchronously, and a JSX prop set before
  // the upgrade would stick as an own property shadowing the element's setter.
  const autocompleteRef = useRef<google.maps.places.PlaceAutocompleteElement | null>(null)
  useEffect(() => {
    if (!ready) return
    const el = autocompleteRef.current
    if (!el) return
    let live = true
    const applyBias = () => {
      if (live && 'locationBias' in el) el.locationBias = viewportBias(map)
    }
    customElements.whenDefined('gmp-place-autocomplete').then(applyBias)
    // Re-anchor on every settled view, so a pan or zoom before typing counts.
    map.on('moveend', applyBias)
    return () => {
      live = false
      map.off('moveend', applyBias)
    }
  }, [ready, map])

  if (!ready) return <div className="leaflet-input-search" />

  const choosing = pending != null && actions.length > 1

  return (
    <>
      <div ref={searchRef} className="leaflet-input-search">
        <gmp-place-autocomplete
          ref={autocompleteRef}
          ongmp-select={async ({placePrediction}: google.maps.places.PlacePredictionSelectEvent) => {
            try {
              const place = placePrediction.toPlace()
              await place.fetchFields({
                fields: ['location', 'googleMapsURI', 'formattedAddress', 'displayName'],
              })
              const location = place.location
              if (!location) return
              pick({
                lat: location.lat(),
                lng: location.lng(),
                formattedAddress: place.formattedAddress ?? null,
                displayName: place.displayName ?? null,
                mapsUri:
                  place.googleMapsURI ??
                  (place as {googleMapsUri?: string | null}).googleMapsUri ??
                  null,
              })
            } catch (err) {
              console.error('Failed to fetch selected place', err)
            }
          }}
        />
        {choosing && (
          <div className="leaflet-input-choices">
            {actions.map((action) => (
              <Button
                key={action.label}
                text={action.label}
                mode="ghost"
                justify="flex-start"
                onClick={() => {
                  const place = pending!
                  setPending(null)
                  action.onPick(place)
                }}
              />
            ))}
          </div>
        )}
      </div>
      {choosing && (
        /* Click-away shield: eats map interactions until a choice or dismissal.
           z-index 999 sits above Leaflet panes (<=700) and below controls
           (>=1000), so toolbars/search stay usable while a choice is pending. */
        <div className="leaflet-input-shield" onClick={() => setPending(null)} />
      )}
    </>
  )
}
