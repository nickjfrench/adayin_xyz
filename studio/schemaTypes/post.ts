import {defineType, defineField, defineArrayMember} from 'sanity'
import {CalloutPreview} from '../components/CalloutPreview'

export const post = defineType({
  name: 'post',
  title: 'Day Itinerary',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      description: 'e.g. "A slow day in the old town"',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      options: {source: 'title'},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'destination',
      title: 'Destination',
      type: 'reference',
      to: [{type: 'destination'}],
      description: 'Which off-the-beaten-track place this day belongs to.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'excerpt',
      title: 'Intro',
      type: 'text',
      rows: 3,
      description: 'A short, honest setup for the day — why it is worth the detour.',
    }),
    defineField({
      name: 'mainImage',
      title: 'Cover image',
      type: 'image',
      options: {hotspot: true},
    }),
    defineField({
      name: 'duration',
      title: 'Duration',
      type: 'string',
      description: 'e.g. "Full day (~8 hrs)" or "Half day"',
    }),
    defineField({
      name: 'testedOn',
      title: 'Tested on',
      type: 'date',
      description: 'When we actually walked this route. Powers the "tested by us" badge.',
    }),
    defineField({
      name: 'testedBy',
      title: 'Tested by',
      type: 'string',
      description: 'Who ran the day, e.g. "Nick & Sam".',
    }),
    defineField({
      name: 'stops',
      title: 'The itinerary',
      type: 'array',
      description: 'The day, stop by stop, in order.',
      of: [
        defineArrayMember({
          name: 'stop',
          title: 'Stop',
          type: 'object',
          fields: [
            defineField({
              name: 'time',
              title: 'Time',
              type: 'string',
              description: 'e.g. "8:00 AM" or "Morning"',
            }),
            defineField({
              name: 'title',
              title: 'What / where',
              type: 'string',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'description',
              title: 'Description',
              type: 'text',
              rows: 3,
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
                      type: 'text',
                      rows: 2,
                      validation: (rule) => rule.required(),
                    }),
                  ],
                  preview: {
                    select: {kind: 'kind', body: 'body'},
                    prepare: (selected: Record<string, unknown>) => selected,
                  },
                  components: {
                    preview: CalloutPreview,
                  },
                }),
              ],
            }),
            defineField({
              name: 'cost',
              title: 'Cost',
              type: 'number',
              description: 'Estimated cost for this stop in local currency (e.g. 15 = $15).',
            }),
            defineField({
              name: 'address',
              title: 'Address',
              type: 'string',
              description: 'Full address — renders as a Google Maps link.',
            }),
          ],
          preview: {
            select: {title: 'title', subtitle: 'time'},
          },
        }),
        defineArrayMember({
          name: 'startLocation',
          title: 'Start location',
          type: 'object',
          fields: [
            defineField({
              name: 'title',
              title: 'What / where',
              type: 'string',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'address',
              title: 'Address',
              type: 'string',
              description: 'Full address — renders as a Google Maps link.',
            }),
          ],
          preview: {
            select: {title: 'title'},
            prepare: ({title}) => ({title, subtitle: 'Start'}),
          },
        }),
        defineArrayMember({
          name: 'endLocation',
          title: 'End location',
          type: 'object',
          fields: [
            defineField({
              name: 'title',
              title: 'What / where',
              type: 'string',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'address',
              title: 'Address',
              type: 'string',
              description: 'Full address — renders as a Google Maps link.',
            }),
          ],
          preview: {
            select: {title: 'title'},
            prepare: ({title}) => ({title, subtitle: 'End'}),
          },
        }),
        defineArrayMember({
          name: 'travel',
          title: 'Travel',
          type: 'object',
          fields: [
            defineField({
              name: 'travelType',
              title: 'Travel type',
              type: 'reference',
              to: [{type: 'travelType'}],
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'title',
              title: 'What / where',
              type: 'string',
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'duration',
              title: 'Duration',
              type: 'string',
              description: 'e.g. "12 min", "~1 hour"',
            }),
            defineField({
              name: 'description',
              title: 'Description',
              type: 'text',
              rows: 2,
            }),
            defineField({
              name: 'address',
              title: 'Address',
              type: 'string',
              description: 'Full address — renders as a Google Maps link.',
            }),
          ],
          preview: {
            select: {title: 'title', duration: 'duration'},
            prepare: ({title, duration}) => ({
              title: title ?? 'Travel',
              subtitle: duration ?? undefined,
            }),
          },
        }),
      ],
    }),
    defineField({
      name: 'body',
      title: 'Closing notes',
      type: 'array',
      description: 'Optional extra notes — getting there, where to stay, what to skip.',
      of: [{type: 'block'}],
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published at',
      type: 'datetime',
    }),
  ],
  preview: {
    select: {title: 'title', subtitle: 'destination.city', media: 'mainImage'},
  },
})
