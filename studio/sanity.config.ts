import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {iconPicker} from 'sanity-plugin-icon-picker'
import {colorInput} from '@sanity/color-input'
import {schemaTypes} from './schemaTypes'
import {leafletMapInput} from './components/leaflet/leafletInputPlugin'

export default defineConfig({
  name: 'default',
  title: 'adayin.xyz',

  projectId: '9egf9s0z',
  dataset: process.env.SANITY_STUDIO_DATASET || 'production',

  plugins: [structureTool(), visionTool(), iconPicker(), colorInput(), leafletMapInput({googlePlacesApiKey: process.env.SANITY_STUDIO_GOOGLE_MAPS_API_KEY})],

  schema: {
    types: schemaTypes,
  },
})
