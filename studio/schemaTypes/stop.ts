import {defineType, defineField, defineArrayMember} from 'sanity'
import {CalloutPreview} from '../components/CalloutPreview'
import {legacyAddressField, locationField} from './locationField'

export const stop = defineType({
  name: 'stop',
  title: 'Stop',
  type: 'document',
  fields: [
    defineField({
      name: 'stopType',
      title: 'Stop type',
      type: 'reference',
      to: [{type: 'stopType'}],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'title',
      title: 'What / where',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'time',
      title: 'Time',
      type: 'string',
      description: 'e.g. "8:00 AM" or "Morning"',
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'array',
      of: [{type: 'block'}],
      description: 'Showed only on the itinerary list.',
    }),
    defineField({
      name: 'longDesc',
      title: 'Long description',
      type: 'array',
      of: [{type: 'block'}],
      description: 'To be displayed on popup modal.',
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      options: {hotspot: true},
    }),
    defineField({
      name: 'cost',
      title: 'Cost',
      type: 'number',
      description: 'Estimated cost for this stop in the selected currency (e.g. 15 units).',
    }),
    defineField({
      name: 'currency',
      title: 'Currency',
      type: 'reference',
      to: [{type: 'currency'}],
      description: 'Currency for this stop’s cost.',
    }),
    {
      ...locationField,
      // The combined pin+region map (StopMapFieldInput via leafletMapInput)
      // hosts this field on stops.
      description: 'Pin the stop on the itinerary route map, or draw a clickable region instead.',
    },
    legacyAddressField,
    defineField({
      name: 'mapFeatures',
      title: 'Map features',
      type: 'mapFeatures',
      // Hidden — regions are drawn on the location field's combined map.
      hidden: true,
      description: 'Optional clickable regions — drawn on the stop map. Label a region to list it as an option.',
    }),
    defineField({
      name: 'callouts',
      title: 'Callouts',
      type: 'array',
      description: 'Extra bite-sized notes — tips, what to order, things to watch for.',
      of: [
        defineArrayMember({
          name: 'callout',
          title: 'Callout',
          type: 'object',
          fields: [
            defineField({
              name: 'kind',
              title: 'Kind',
              type: 'reference',
              to: [{type: 'calloutKind'}],
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'body',
              title: 'Body',
              type: 'array',
              of: [{type: 'block'}],
              validation: (rule) => rule.required(),
            }),
          ],
          preview: {
            select: {kind: 'kind', body: 'body'},
            prepare: (selected: Record<string, unknown>) => selected,
          },
          components: {
            preview: CalloutPreview as any,
          },
        }),
      ],
    }),
    defineField({
      name: 'link',
      title: 'Link',
      type: 'url',
      description: 'External link for recommendation-type stops.',
    }),
  ],
  preview: {
    select: {title: 'title', subtitle: 'stopType.label'},
  },
})
