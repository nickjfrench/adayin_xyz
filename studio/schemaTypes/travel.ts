import {defineType, defineField} from 'sanity'

export const travel = defineType({
  name: 'travel',
  title: 'Travel',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'What / where',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'travelType', 
      title: 'Travel type',
      type: 'reference',
      to: [{type: 'travelType'}],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'duration',
      title: 'Duration',
      type: 'string',
      description: 'e.g. "12 min", "~1 hour"',
    }),
    defineField({
      name: 'longDesc',
      title: 'Long description',
      type: 'text',
      rows: 3,
      description: 'To be displayed on popup modal.',
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      options: {hotspot: true},
    }),
    defineField({
      name: 'address',
      title: 'Address',
      type: 'string',
      description: 'Full address — renders as a Google Maps link.',
    }),
    defineField({
      name: 'cost',
      title: 'Cost',
      type: 'number',
      description: 'Estimated cost for this leg in local currency (e.g. 15 = $15).',
    }),
  ],
  preview: {
    select: {title: 'title', subtitle: 'travelType.label'},
    prepare: ({title, subtitle}) => ({title: title ?? 'Travel', subtitle}),
  },
})
