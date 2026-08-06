import {defineType, defineField, defineArrayMember} from 'sanity'
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
    defineField({
      name: 'ranges',
      title: 'Price ranges',
      type: 'array',
      description:
        'Price tiers for this currency, cheapest first, in the currency\'s own units. Each tier repeats the currency symbol (tier 1 = $, tier 2 = $$, …). Anything above the highest entered value is automatically the next band, e.g. enter 50 and 100 to get $$$ as 100+.',
      of: [
        defineArrayMember({
          name: 'priceRange',
          title: 'Range',
          type: 'object',
          fields: [
            defineField({
              name: 'value',
              title: 'Value',
              type: 'number',
              description: 'Money value (in this currency\'s own units) at the top of this price band, e.g. 50, 100. Spend at or below this value falls in this band; the next band above is automatic.',
              validation: (rule) => rule.required().positive(),
            }),
          ],
          preview: {
            select: {value: 'value'},
            prepare: ({value}: {value?: number}) => ({title: value != null ? `≤ ${value}` : '—', subtitle: 'price range'}),
          },
        }),
      ],
    }),
  ],
  preview: {
    select: {title: 'code', subtitle: 'name', provider: 'icon.provider', name: 'icon.name'},
    prepare({title, subtitle, provider, name: iconName}) {
      return {title, subtitle, media: provider && iconName ? preview({provider, name: iconName}) : undefined}
    },
  },
})