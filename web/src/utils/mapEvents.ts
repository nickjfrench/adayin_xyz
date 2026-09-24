// Shared DOM event contract between the map island and the stop modal island.
// Kept map-library-free on purpose: importing itineraryMap.ts pulls MapLibre,
// which crashes any server-side import.
export const STOP_OPEN_EVENT = 'itinerary:open-stop'
