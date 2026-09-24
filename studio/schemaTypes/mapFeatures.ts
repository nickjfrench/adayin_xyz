import { defineType, defineField } from 'sanity'
import { SHAPE_NAMES } from '@adayin/map-core/core'

export const mapFeature = defineType({
  name: 'mapFeature',
  title: 'Map feature',
  type: 'object',
  fields: [
    defineField({
      name: 'label',
      title: 'Label',
      type: 'string',
      description: 'Optional. Labeled features are listed as options on the stop.',
    }),
    defineField({
      name: 'shape',
      title: 'Shape',
      type: 'string',
      // SHAPE_NAMES is the single source of truth (registry in
      // components/map/shapes.ts) — no duplicated shape list here.
      options: { list: [...SHAPE_NAMES] },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'position',
      title: 'Position',
      type: 'geopoint',
      description: 'Center — used by circle.',
    }),
    defineField({
      name: 'radius',
      title: 'Radius (m)',
      type: 'number',
    }),
    defineField({
      name: 'points',
      title: 'Points',
      type: 'array',
      of: [{ type: 'geopoint' }],
      description: 'Vertices — used by polygon.',
    }),
  ],
  preview: {
    select: { label: 'label', shape: 'shape' },
    prepare: ({ label, shape }: { label?: string; shape?: string }) => ({
      title: label || 'Unnamed feature',
      subtitle: shape,
    }),
  },
})

export const mapFeatures = defineType({
  name: 'mapFeatures',
  title: 'Map features',
  type: 'array',
  of: [{ type: 'mapFeature' }],
})
