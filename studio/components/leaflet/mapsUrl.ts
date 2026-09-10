/** Google Maps search URL for a raw pin — used when the location was set manually (no Place URI). */
export function mapsQueryUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
}
