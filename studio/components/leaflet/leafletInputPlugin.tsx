import {definePlugin} from 'sanity'
import type {ArrayOfObjectsInputProps, InputProps, ObjectInputProps, SchemaType} from 'sanity'
import {LeafletLocationInput} from './LeafletLocationInput'
import {MapFeaturesInput} from './MapFeaturesInput'

export interface LeafletInputConfig {
  googlePlacesApiKey?: string
}

export const leafletMapInput = definePlugin<LeafletInputConfig>((config) => ({
  name: 'leaflet-map-input',
  form: {
    components: {
      input: (props: InputProps) => {
        if (isType('location', props.schemaType)) {
          return <LeafletLocationInput {...(props as ObjectInputProps)} apiKey={config.googlePlacesApiKey} />
        }
        if (isType('mapFeatures', props.schemaType)) {
          return <MapFeaturesInput {...(props as ArrayOfObjectsInputProps)} apiKey={config.googlePlacesApiKey} />
        }
        return props.renderDefault(props)
      },
    },
  },
}))

// Recursive name match through the type chain — same helper shape as
// @sanity/google-maps-input's plugin.tsx (field types can alias the base type).
function isType(name: string, schemaType?: SchemaType): boolean {
  if (schemaType?.name === name) return true
  if (!schemaType?.name) return false
  return isType(name, schemaType.type)
}
