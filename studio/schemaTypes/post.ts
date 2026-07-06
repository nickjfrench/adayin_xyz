import {defineType, defineField, defineArrayMember} from 'sanity'

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
              name: 'tip',
              title: 'Insider tip',
              type: 'string',
              description: 'The thing only locals (or we) know.',
            }),
          ],
          preview: {
            select: {title: 'title', subtitle: 'time'},
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
