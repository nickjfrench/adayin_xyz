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

/**
 * Places autocomplete overlay for the map. Renders nothing on load failure —
 * the map is unaffected. Wired like @sanity/google-maps-input's SearchInput.
 */
export function PlacesSearch({
  apiKey,
  actions,
}: {
  apiKey: string
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

  if (!ready) return <div className="leaflet-input-search" />

  const choosing = pending != null && actions.length > 1

  return (
    <>
      <div ref={searchRef} className="leaflet-input-search">
        <gmp-place-autocomplete
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
