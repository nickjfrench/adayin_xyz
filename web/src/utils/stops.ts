/** Stop classification shared by every surface that counts or numbers stops. */

/** Any itinerary item as stored in `post.stops` — only `_type` classifies it. */
export interface StopLike {
  _type?: string
}

/** True for a real itinerary stop: excludes start/end locations and travel legs. */
export function isStop(stop?: StopLike | null): boolean {
  return stop?._type === 'stop'
}

/** Count only real stops, excluding start/end locations and travel segments. */
export function countStops(stops?: StopLike[] | null): number {
  return (stops ?? []).filter(isStop).length
}

/**
 * 1-based stop number per array slot, in order: real stops number 1..n, while
 * start/end locations and travel legs are null. `countStops` is the last
 * number handed out, so map pins and "n stops" labels can't disagree.
 */
export function stopNumbers(stops?: StopLike[] | null): (number | null)[] {
  let n = 0
  return (stops ?? []).map((s) => (isStop(s) ? ++n : null))
}
