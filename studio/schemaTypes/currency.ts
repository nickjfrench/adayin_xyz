import {defineType, defineField} from 'sanity'
import {preview} from 'sanity-plugin-icon-picker'

export const currency = defineType({
  name: 'currency',
  title: 'Currency',
  type: 'document',
  fields: [
    defineField({
      name: 'name',
      title: 'Full name',
      type: 'string',
      description: 'e.g. "Australian Dollar".',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'code',
      title: 'Code',
      type: 'string',
      description: 'ISO 4217 three-letter code, e.g. "AUD".',
      validation: (rule) => rule.required().max(3).uppercase(),
    }),
    defineField({
      name: 'icon',
      title: 'Symbol icon',
      type: 'iconPicker',
      options: {storeSvg: true, providers: ['fi', 'fa', 'hi', 'mdi', 'sa']},
    }),
  ],
  preview: {
    select: {title: 'code', subtitle: 'name', provider: 'icon.provider', name: 'icon.name'},
    prepare({title, subtitle, provider, name: iconName}) {
      return {title, subtitle, media: provider && iconName ? preview({provider, name: iconName}) : undefined}
    },
  },
})