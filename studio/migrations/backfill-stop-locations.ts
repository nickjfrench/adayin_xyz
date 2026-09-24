import { defineMigration, at, set, type NodePatch } from 'sanity/migrate'
import { mapsQueryUrl } from '@adayin/map-core/core'

/**
 * Places (New) Text Search — the REST twin of the studio map search
 * (components/map/googlePlaces.tsx fetches `location`, `formattedAddress`
 * and `googleMapsURI` for a selected place). The migration runs in Node, so it
 * calls places.googleapis.com directly instead of loading the browser SDK.
 * Requests run serially to keep logs and retries predictable; Text Search has
 * no 1 req/s cap like Nominatim did.
 *
 * Coordinate addresses — "45°25'25.8"N 75°41'31.9"W" — are the one thing
 * Places cannot answer: it rejects them as queries ("Coordinates are not a
 * valid input for the query search parameter"). Nothing needs answering
 * either: the numbers are already the pin, so they are parsed locally, and the
 * raw string stays the label (the manual-pin shape the studio writes).
 */
interface PlaceMatch {
  lat: number
  lng: number
  formattedAddress: string
  mapsUri: string
}

/** The Text Search response, limited to the FieldMask requested below. */
interface PlacesResponse {
  places?: Array<{
    formattedAddress?: string
    location?: { latitude?: number; longitude?: number }
    googleMapsUri?: string
  }>
}

/** One half of a coordinate pair: signed decimal degrees, plus the axis a hemisphere letter names (null without one). */
interface CoordPart {
  value: number
  axis: 'lat' | 'lng' | null
}

/** One half from regex groups; null when the numbers are malformed or a letter sits on both sides. */
function coordPart(
  deg: string | undefined,
  min: string | undefined,
  sec: string | undefined,
  hemBefore: string | undefined,
  hemAfter: string | undefined,
): CoordPart | null {
  if (deg == null || (hemBefore != null && hemAfter != null)) return null
  const degrees = Number(deg)
  const minutes = min == null ? 0 : Number(min)
  const seconds = sec == null ? 0 : Number(sec)
  if (!Number.isFinite(degrees) || minutes >= 60 || seconds >= 60) return null
  const hemisphere = (hemBefore ?? hemAfter)?.toUpperCase()
  const negative = hemisphere === 'S' || hemisphere === 'W' || degrees < 0
  return {
    value: (negative ? -1 : 1) * (Math.abs(degrees) + minutes / 60 + seconds / 3600),
    axis: hemisphere == null ? null : hemisphere === 'N' || hemisphere === 'S' ? 'lat' : 'lng',
  }
}

/**
 * Places both halves on their axes: hemisphere letters decide which is
 * latitude; without them latitude comes first, swapped only when the first
 * number cannot be one (> 90°) — how a longitude-first string reads.
 */
function coordPair(a: CoordPart | null, b: CoordPart | null): { lat: number; lng: number } | null {
  if (!a || !b || (a.axis != null && a.axis === b.axis)) return null
  const swapped =
    a.axis === 'lng' ||
    b.axis === 'lat' ||
    (!a.axis && !b.axis && Math.abs(a.value) > 90 && Math.abs(b.value) <= 90)
  const lat = swapped ? b : a
  const lng = swapped ? a : b
  if (Math.abs(lat.value) > 90 || Math.abs(lng.value) > 180) return null
  return { lat: lat.value, lng: lng.value }
}

// One half of a degrees/minutes/seconds pair (what Google Maps copies).
// Degrees and ° are required, minutes and seconds are not. A hemisphere letter
// may lead the degrees or trail the last unit — a trailing one must be attached
// ("45°25'25.8"N"), so that N can never read as the next half's prefix.
const dmsUnit = (s: string) =>
  String.raw`(?:(?<${s}Hem>[NSEW])\s*)?(?<${s}Deg>-?\d{1,3}(?:\.\d+)?)\s*°` +
  String.raw`(?:\s*(?<${s}Min>\d{1,2}(?:\.\d+)?)\s*['′])?` +
  String.raw`(?:\s*(?<${s}Sec>\d{1,2}(?:\.\d+)?)\s*["″])?` +
  String.raw`(?<${s}HemAfter>[NSEW])?`

// The other shape: a decimal pair, "45.423833, -75.692194". Both halves need a
// decimal point, so a numbered address ("Unit 4, 30 Foo St") cannot match.
const decimalUnit = (s: string) =>
  String.raw`(?:(?<${s}Hem>[NSEW])\s*)?(?<${s}Deg>-?\d{1,3}\.\d+)(?<${s}HemAfter>[NSEW])?`

// Built from strings: named groups need ES2018, and studio's tsconfig targets ES2017.
const DMS_PAIR = new RegExp(`^${dmsUnit('a')}(?:\\s*[,;]\\s*|\\s+)${dmsUnit('b')}$`, 'i')
const DECIMAL_PAIR = new RegExp(`^${decimalUnit('a')}\\s*[,;]\\s*${decimalUnit('b')}$`, 'i')

/** A coordinate address → lat/lng; null when the string is not one, so a place name can never half-match. */
function parseLatLng(address: string): { lat: number; lng: number } | null {
  // Typographic primes/quotes are what a paste from a word processor carries.
  const text = address.trim().replace(/[’′]/g, "'").replace(/[”″]/g, '"')
  for (const re of [DMS_PAIR, DECIMAL_PAIR]) {
    const g = re.exec(text)?.groups
    if (!g) continue
    // Hemispheres are all or nothing across the pair: one lettered half and one
    // bare half means a trailing letter was misread as the other half's prefix.
    const aHem = g.aHem ?? g.aHemAfter
    const bHem = g.bHem ?? g.bHemAfter
    if ((aHem == null) !== (bHem == null)) continue
    const pair = coordPair(
      coordPart(g.aDeg, g.aMin, g.aSec, g.aHem, g.aHemAfter),
      coordPart(g.bDeg, g.bMin, g.bSec, g.bHem, g.bHemAfter),
    )
    if (pair) return pair
  }
  return null
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
        body: JSON.stringify({ textQuery: address }),
      })
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300)
        // A coordinate string parseLatLng could not read is still not a query:
        // Places rejects it deterministically, unlike the invalid/unentitled
        // key and quota failures below. Skip that document — its pin, if any,
        // still gets the manual-pin fields — instead of aborting the run.
        if (res.status === 400 && detail.includes('Coordinates are not a valid input')) {
          console.warn(`[places] unrecognized coordinates, skipped: "${address}"`)
          return null
        }
        // Every other non-200 aborts the run — invalid or unentitled key (400
        // INVALID_ARGUMENT on a key that is not enabled for Places), quota,
        // outage alike. A MISS must only ever mean "Places answered, with
        // nothing usable in it": the 200-with-no-places case below. Reading a
        // rejected request as a miss writes fallback data that drops the
        // document out of the filter with no real match in it, and no rerun
        // could repair it.
        throw new Error(`Places HTTP ${res.status} for "${address}": ${detail}`)
      }
      // FieldMask above pins the response shape; the coordinate values are
      // guarded below, and a 200 without places is a MISS, not an error.
      const body = (await res.json()) as PlacesResponse
      const hit = body.places?.[0]
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
        formattedAddress: hit.formattedAddress ?? address,
        mapsUri: hit.googleMapsUri ?? mapsQueryUrl(lat, lng),
      }
    } catch (err) {
      // Every other request-level failure (HTTP error above, DNS, connection
      // reset, non-JSON body) aborts the run: a MISS must only ever mean
      // "Places answered, with nothing usable in it".
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
  // Half-set locations belong here too: a label without coords is not a pin, and
  // the document handler replaces those coords rather than keeping them.
  filter:
    'defined(address) && (!defined(location) || !defined(location.formattedAddress) || !defined(location.mapsUri) || !defined(location.lat) || !defined(location.lng))',
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
        { lat?: number; lng?: number; formattedAddress?: string; mapsUri?: string } | undefined
      const pin =
        existing?.lat != null && existing?.lng != null
          ? { lat: existing.lat, lng: existing.lng }
          : null

      // A coordinate address is its own lookup — no search can improve on the
      // numbers, and Places rejects "45°25'25.8"N 75°41'31.9"W" as a query. A
      // stored pin wins over the parsed numbers, so the URL below is built from
      // the coords actually written.
      const parsed = parseLatLng(address)
      const coords = parsed && { lat: pin?.lat ?? parsed.lat, lng: pin?.lng ?? parsed.lng }
      const match: PlaceMatch | null = coords
        ? {
            lat: coords.lat,
            lng: coords.lng,
            formattedAddress: address,
            mapsUri: mapsQueryUrl(coords.lat, coords.lng),
          }
        : await searchPlace(address)
      if (match) {
        const lat = pin?.lat ?? match.lat
        const lng = pin?.lng ?? match.lng
        const source = coords ? 'address coordinates' : match.formattedAddress
        console.log(
          `[places] ${lat.toFixed(5)},${lng.toFixed(5)} ← "${address}"${pin ? ' (pin kept)' : ''} (${source})`,
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
