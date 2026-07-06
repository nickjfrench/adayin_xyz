import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {iconPicker} from 'sanity-plugin-icon-picker'
import {schemaTypes} from './schemaTypes'

export default defineConfig({
  name: 'default',
  title: 'adayin.xyz',

  projectId: '9egf9s0z',
  dataset: 'production',

  plugins: [structureTool(), visionTool(), iconPicker()],

  schema: {
    types: schemaTypes,
  },
})
