import {defineType, defineField} from 'sanity'
import {preview} from 'sanity-plugin-icon-picker'

export const audience = defineType({
  name: 'audience',
  title: 'Audience',
  type: 'document',
  fields: [
    defineField({
      name: 'label',
      title: 'Short label',
      type: 'string',
      description: 'Shown on the badge, e.g. "DINK", "Family", "Mobility-friendly".',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'longName',
      title: 'Long name',
      type: 'string',
      description: 'Shown as the hover tooltip, e.g. "Suited for double-income, no-kids travellers".',
    }),
    defineField({
      name: 'name',
      title: 'Identifier',
      type: 'slug',
      options: {source: 'label'},
      description: 'Auto-generated from the short label.',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'icon',
      title: 'Icon',
      type: 'iconPicker',
      options: {storeSvg: true, providers: ['fi', 'fa', 'hi', 'mdi', 'sa']},
    }),
  ],
  preview: {
    select: {title: 'label', subtitle: 'longName', provider: 'icon.provider', name: 'icon.name'},
    prepare({title, subtitle, provider, name: iconName}) {
      return {title, subtitle, media: provider && iconName ? preview({provider, name: iconName}) : undefined}
    },
  },
})