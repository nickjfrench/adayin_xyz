import {defineType, defineField} from 'sanity'

export const startLocation = defineType({
  name: 'startLocation',
  title: 'Start location',
  type: 'document',
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
    defineField({
      name: 'time',
      title: 'Time',
      type: 'string',
      description: 'e.g. "8:00 AM" or "Morning"',
    }),
  ],
  preview: {
    select: {title: 'title'},
    prepare: ({title}) => ({title, subtitle: 'Start'}),
  },
})
