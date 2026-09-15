import { mapsQueryUrl, type LocationValue } from '@adayin/map-core/core';

export type { LocationValue };

/**
 * Maps URL for a stop: the stored multipart mapsUri (Place URI from search,
 * lat,lng query URL for manual pins) → pin coords → legacy address query
 * (kept until addresses are backfilled into `location`) → null.
 */
export function mapsLinkFor(
  location: LocationValue | null | undefined,
  address?: string | null,
): string | null {
  const { mapsUri, lat, lng } = location ?? {};
  if (mapsUri) return mapsUri;
  if (lat != null && lng != null) return mapsQueryUrl(lat, lng);
  if (address) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return null;
}

/**
 * Link text for the Maps link — the multipart formattedAddress, else the legacy
 * address, else the pin coords (a manually placed pin carries no address; the
 * link must still have a label). Mirrors the studio's "Primary POI" line.
 */
export function mapsLinkText(
  location: LocationValue | null | undefined,
  address?: string | null,
): string | null {
  const formatted = location?.formattedAddress ?? address;
  if (formatted) return formatted;
  const { lat, lng } = location ?? {};
  if (lat != null && lng != null) return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  return null;
}
