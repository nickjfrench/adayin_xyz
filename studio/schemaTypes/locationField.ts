import {defineField, defineType} from 'sanity'

/**
 * Multipart location: pin coords + the address label and Maps URL the web
 * renders as the "address" link. Shared by stop, travel, startLocation and
 * endLocation — one definition keeps the field shape in sync for the web GROQ
 * projection (`location` on stops) and the location backfill migration filter.
 *
 * mapsUri is the Place's googleMapsURI when set via search, or a lat,lng
 * query URL when the pin was placed manually (map click / marker drag).
 */
export const location = defineType({
  name: 'location',
  title: 'Location',
  type: 'object',
  fields: [
    defineField({name: 'lat', title: 'Latitude', type: 'number'}),
    defineField({name: 'lng', title: 'Longitude', type: 'number'}),
    defineField({
      name: 'formattedAddress',
      title: 'Formatted address',
      type: 'string',
      description: 'Link label shown on the site.',
    }),
    defineField({
      name: 'mapsUri',
      title: 'Maps URL',
      type: 'url',
      description: 'Where the Maps link points — place URL from search, or a lat,lng query URL for a manual pin.',
    }),
  ],
  preview: {
    select: {formattedAddress: 'formattedAddress', lat: 'lat', lng: 'lng'},
    prepare: ({formattedAddress, lat, lng}: {formattedAddress?: string; lat?: number; lng?: number}) => ({
      title: formattedAddress || (lat != null && lng != null ? `${lat}, ${lng}` : 'Not set'),
    }),
  },
})

// Field wrapper shared by the documents above — keeps field name/description
// in one place; the type itself is `location` (registered in index.ts).
export const locationField = defineField({
  name: 'location',
  title: 'Location',
  type: 'location',
  description: 'Map pin — plots this stop on the itinerary route map.',
})
