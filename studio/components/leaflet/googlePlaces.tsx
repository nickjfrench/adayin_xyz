import {useEffect, useRef, useState} from 'react'
import L from 'leaflet'

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
  mapsUri: string | null
}

/**
 * Places autocomplete overlay for the map. Renders nothing on load failure —
 * the map is unaffected. Wired like @sanity/google-maps-input's SearchInput.
 */
export function PlacesSearch({
  apiKey,
  onSelect,
}: {
  apiKey: string
  onSelect: (place: SelectedPlace) => void
}) {
  const [ready, setReady] = useState(false)

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

  if (!ready) return <div className="leaflet-input-search" />

  return (
    <div ref={searchRef} className="leaflet-input-search">
      <gmp-place-autocomplete
        ongmp-select={async ({placePrediction}: google.maps.places.PlacePredictionSelectEvent) => {
          try {
            const place = placePrediction.toPlace()
            await place.fetchFields({fields: ['location', 'googleMapsURI', 'formattedAddress']})
            const location = place.location
            if (!location) return
            onSelect({
              lat: location.lat(),
              lng: location.lng(),
              formattedAddress: place.formattedAddress ?? null,
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
    </div>
  )
}
