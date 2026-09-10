import {defineMigration, at, set, type NodePatch} from '@sanity/migrate'

const USER_AGENT = 'adayin-xyz-studio-geocode/1.0 (https://adayin.xyz)'

// Serialized queue: Nominatim allows max 1 request/second.
let queue: Promise<unknown> = Promise.resolve()
function geocode(address: string): Promise<{lat: number, lng: number, displayName: string} | null> {
  const run = async () => {
    const {promise, resolve} = Promise.withResolvers<void>()
    setTimeout(resolve, 1100)
    await promise
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=jsonv2&limit=1`
    const res = await fetch(url, {headers: {'User-Agent': USER_AGENT, 'Accept-Language': 'en'}})
    if (!res.ok) return null
    const hits: unknown = await res.json()
    const hit = (Array.isArray(hits) ? hits[0] : null) as {lat?: string, lon?: string, display_name?: string} | null
    if (!hit) return null
    const lat = Number(hit.lat)
    const lng = Number(hit.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
    return {lat, lng, displayName: String(hit.display_name ?? '')}
  }
  const next = queue.then(run, run)
  queue = next
  return next as Promise<{lat: number, lng: number, displayName: string} | null>
}

export default defineMigration({
  title: 'Backfill stop/start/end location geopoints from addresses (Nominatim)',
  documentTypes: ['stop', 'startLocation', 'endLocation'],
  filter: 'defined(address) && !defined(location)',
  migrate: {
    document: async (doc): Promise<NodePatch[] | undefined> => {
      const address = String((doc as Record<string, unknown>).address ?? '')
      const result = await geocode(address)
      if (!result) {
        console.warn(`[geocode] MISS: "${doc.title ?? doc._id}" — "${address}"`)
        return undefined
      }
      console.log(`[geocode] ${result.lat.toFixed(5)},${result.lng.toFixed(5)} ← "${address}" (${result.displayName})`)
      return [at('location', set({_type: 'geopoint', lat: result.lat, lng: result.lng}))]
    },
  },
})
