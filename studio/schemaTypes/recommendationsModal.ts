import {defineType, defineField} from 'sanity'
import {preview} from 'sanity-plugin-icon-picker'

export const recommendationsModal = defineType({
  name: 'recommendationsModal',
  title: 'Recommendations modal',
  type: 'document',
  fields: [
    defineField({
      name: 'label',
      title: 'Display label',
      type: 'string',
      description: 'Shown on the frontend, e.g. "Winery visit".',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'name',
      title: 'Identifier',
      type: 'slug',
      options: {source: 'label'},
      description: 'Auto-generated from the display label.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'recommendationType',
      title: 'Recommendation type',
      type: 'reference',
      to: [{type: 'recommendationType'}],
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'image',
      title: 'Image',
      type: 'image',
      options: {hotspot: true},
    }),
    defineField({
      name: 'shortDesc',
      title: 'Short description',
      type: 'text',
      rows: 2,
    }),
    defineField({
      name: 'link',
      title: 'Link',
      type: 'url',
      validation: (rule) => rule.required(),
    }),
  ],
  preview: {
    select: {title: 'label', subtitle: 'name.current', provider: 'icon.provider', name: 'icon.name'},
    prepare({title, subtitle, provider, name: iconName}) {
      return {
        title,
        subtitle,
        media: provider && iconName ? preview({provider, name: iconName}) : undefined,
      }
    },
  },
})
