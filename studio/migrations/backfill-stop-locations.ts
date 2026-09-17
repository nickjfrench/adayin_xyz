import {defineMigration, at, set, type NodePatch} from 'sanity/migrate'
import {mapsQueryUrl} from '@adayin/map-core/core'

/**
 * Places (New) Text Search — the REST twin of the studio map search
 * (components/map/googlePlaces.tsx fetches `location`, `formattedAddress`
 * and `googleMapsURI` for a selected place). The migration runs in Node, so it
 * calls places.googleapis.com directly instead of loading the browser SDK.
 * Requests run serially to keep logs and retries predictable; Text Search has
 * no 1 req/s cap like Nominatim did.
 */
interface PlaceMatch {
  lat: number
  lng: number
  formattedAddress: string
  mapsUri: string
}

// Serialized queue: one in-flight search at a time.
let queue: Promise<unknown> = Promise.resolve()
function searchPlace(address: string): Promise<PlaceMatch | null> {
  const run = async (): Promise<PlaceMatch | null> => {
    const apiKey = process.env.SANITY_STUDIO_GOOGLE_MAPS_API_KEY
    if (!apiKey) {
      throw new Error('Missing SANITY_STUDIO_GOOGLE_MAPS_API_KEY — add it to studio/.env and rerun')
    }
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          // Same three fields the studio map search fetches and stores.
          'X-Goog-FieldMask': 'places.location,places.formattedAddress,places.googleMapsUri',
        },
        body: JSON.stringify({textQuery: address}),
      })
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300)
        // 400 = Places rejected the address itself → a genuine MISS. Everything
        // else (bad key, quota, outage) aborts the run: storing fallback data
        // for a failed lookup would drop the document out of the filter with no
        // real match in it, and no rerun could repair it.
        if (res.status !== 400) {
          throw new Error(`Places HTTP ${res.status} for "${address}": ${detail}`)
        }
        console.warn(`[places] HTTP 400 for "${address}": ${detail}`)
        return null
      }
      const hit = ((await res.json()) as {places?: unknown[]}).places?.[0] as
        | {
            formattedAddress?: string
            location?: {latitude?: number; longitude?: number}
            googleMapsUri?: string
          }
        | undefined
      const lat = Number(hit?.location?.latitude)
      const lng = Number(hit?.location?.longitude)
      if (
        !hit ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        Math.abs(lat) > 90 ||
        Math.abs(lng) > 180
      )
        return null
      return {
        lat,
        lng,
        formattedAddress: String(hit.formattedAddress ?? address),
        mapsUri: hit.googleMapsUri ?? mapsQueryUrl(lat, lng),
      }
    } catch (err) {
      // Every request-level failure (HTTP error above, DNS, connection reset,
      // non-JSON body) aborts the run: a MISS must only ever mean "Places
      // answered, with nothing usable in it".
      console.warn(`[places] search failed for "${address}"`, err)
      throw err
    }
  }
  const next = queue.then(run, run)
  queue = next
  return next as Promise<PlaceMatch | null>
}

export default defineMigration({
  title:
    'Backfill stop/start/end/travel locations (coords + formattedAddress + mapsUri) from addresses',
  documentTypes: ['stop', 'startLocation', 'endLocation', 'travel'],
  filter:
    'defined(address) && (!defined(location) || !defined(location.formattedAddress) || !defined(location.mapsUri))',
  migrate: {
    document: async (doc): Promise<NodePatch[]> => {
      // Migration reads pre-schema raw documents — dynamic keys the generated
      // types don't cover. Values are guarded (Number.isFinite) before use.
      const raw = doc as Record<string, unknown>
      const address = String(raw.address ?? '')
      if (!address.trim()) return [] // empty address → pointless 400 from Places
      // Existing editor data wins: a complete manual pin keeps its coords, and
      // the match only fills the fields the location doesn't already carry.
      // Half-set coords (API/import writes only) are not a pin.
      const existing = raw.location as
        {lat?: number; lng?: number; formattedAddress?: string; mapsUri?: string} | undefined
      const pin =
        existing?.lat != null && existing?.lng != null
          ? {lat: existing.lat, lng: existing.lng}
          : null

      const match = await searchPlace(address)
      if (match) {
        const lat = pin?.lat ?? match.lat
        const lng = pin?.lng ?? match.lng
        console.log(
          `[places] ${lat.toFixed(5)},${lng.toFixed(5)} ← "${address}"${pin ? ' (pin kept)' : ''} (${match.formattedAddress})`,
        )
        return [
          at(
            'location',
            set({
              _type: 'location',
              lat,
              lng,
              formattedAddress: existing?.formattedAddress ?? match.formattedAddress,
              mapsUri: existing?.mapsUri ?? match.mapsUri,
            }),
          ),
        ]
      }
      if (pin) {
        // No Place match, but the pin exists: write the manual-pin shape the
        // studio input produces — raw address label + lat,lng query URL.
        console.warn(
          `[places] MISS: "${doc.title ?? doc._id}" — "${address}" (pin kept, manual fields)`,
        )
        return [
          at(
            'location',
            set({
              _type: 'location',
              lat: pin.lat,
              lng: pin.lng,
              formattedAddress: existing?.formattedAddress ?? address,
              mapsUri: existing?.mapsUri ?? mapsQueryUrl(pin.lat, pin.lng),
            }),
          ),
        ]
      }
      console.warn(`[places] MISS: "${doc.title ?? doc._id}" — "${address}"`)
      return []
    },
  },
})
