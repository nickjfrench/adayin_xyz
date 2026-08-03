import {defineType, defineField} from 'sanity'
import {preview} from 'sanity-plugin-icon-picker'

export const stopType = defineType({
  name: 'stopType',
  title: 'Stop type',
  type: 'document',
  fields: [
    defineField({
      name: 'label',
      title: 'Display label',
      type: 'string',
      description: 'Shown on the frontend, e.g. "Stop", "Travel", "Start location", "End location".',
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
      name: 'icon',
      title: 'Icon',
      type: 'iconPicker',
      options: {
        storeSvg: true,
        providers: ['fi', 'fa', 'hi', 'mdi', 'sa'],
      },
    }),
  ],
  preview: {
    select: {title: 'label', subtitle: 'name.current', provider: 'icon.provider', name: 'icon.name'},
    prepare({title, subtitle, provider, name: iconName}) {
      return {
        title,
        subtitle,
        media: provider && iconName ? preview({provider, name: iconName}) : undefined,
      };
    },
  },
})
