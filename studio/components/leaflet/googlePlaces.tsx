import {useEffect, useState} from 'react'

let loader: Promise<void> | null = null

/** Loads the Google Places library once per session; rejects if the script errors. */
export function loadGooglePlaces(apiKey: string): Promise<void> {
  loader ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&loading=async&v=weekly`
    script.async = true
    script.addEventListener('load', () => resolve())
    script.addEventListener('error', () => reject(new Error('Google Places failed to load')))
    document.head.appendChild(script)
  })
  return loader
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
  onSelect: (latLng: {lat: number; lng: number}) => void
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

  if (!ready) return <div className="leaflet-input-search" />

  return (
    <div className="leaflet-input-search">
      <gmp-place-autocomplete
        ongmp-select={async ({placePrediction}: google.maps.places.PlacePredictionSelectEvent) => {
          const place = placePrediction.toPlace()
          await place.fetchFields({fields: ['location']})
          const location = place.location
          if (!location) return
          onSelect({lat: location.lat(), lng: location.lng()})
        }}
      />
    </div>
  )
}
