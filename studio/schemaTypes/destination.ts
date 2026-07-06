import {defineType, defineField} from 'sanity'

export const destination = defineType({
  name: 'destination',
  title: 'Destination',
  type: 'document',
  fields: [
    defineField({
      name: 'city',
      title: 'City',
      type: 'string',
      description: 'e.g. Melbourne',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'country',
      title: 'Country',
      type: 'string',
      description: 'Full country name, e.g. Australia',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'countryShort',
      title: 'Country (short)',
      type: 'string',
      description: 'Short code shown next to the city, e.g. Aus, Can, USA',
      validation: (rule) => rule.required().max(6),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'city'},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'heroImage',
      title: 'Hero image',
      type: 'image',
      description: 'Wide landscape shot used behind the hero for this destination.',
      options: {hotspot: true},
    }),
    defineField({
      name: 'blurb',
      title: 'Blurb',
      type: 'text',
      rows: 2,
      description: 'One-line teaser shown on destination cards.',
    }),
    defineField({
      name: 'order',
      title: 'Display order',
      type: 'number',
      description: 'Lower numbers appear first in the hero cycle and dropdown.',
      initialValue: 0,
    }),
  ],
  preview: {
    select: {title: 'city', subtitle: 'country', media: 'heroImage'},
  },
})
