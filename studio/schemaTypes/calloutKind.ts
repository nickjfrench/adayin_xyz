import {defineType, defineField} from 'sanity'
import {preview} from 'sanity-plugin-icon-picker'

export const calloutKind = defineType({
  name: 'calloutKind',
  title: 'Callout kind',
  type: 'document',
  fields: [
    defineField({
      name: 'label',
      title: 'Display label',
      type: 'string',
      description: 'Shown on the frontend, e.g. "Insider tip".',
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
    defineField({
      name: 'accent',
      title: 'Accent border',
      type: 'string',
      description: 'Tailwind border class, e.g. "border-sand-400".',
    }),
    defineField({
      name: 'labelColor',
      title: 'Label color',
      type: 'string',
      description: 'Tailwind text class, e.g. "text-sand-500".',
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
