import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {iconPicker} from 'sanity-plugin-icon-picker'
import {colorInput} from '@sanity/color-input'
import {schemaTypes} from './schemaTypes'

export default defineConfig({
  name: 'default',
  title: 'adayin.xyz',

  projectId: '9egf9s0z',
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',

  plugins: [structureTool(), visionTool(), iconPicker(), colorInput()],

  schema: {
    types: schemaTypes,
  },
})
