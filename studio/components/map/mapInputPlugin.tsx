import { definePlugin } from 'sanity'
import type { InputProps, ObjectInputProps, SchemaType } from 'sanity'
import { LocationFieldInput, StopMapDocumentInput } from './StopMapInput'

export interface MapInputConfig {
  googlePlacesApiKey?: string
}

export const mapInput = definePlugin<MapInputConfig>((config) => ({
  name: 'map-input',
  form: {
    components: {
      input: (props: InputProps) => {
        if (props.schemaType.name === 'stop') {
          // Stops get one combined map that owns both the pin (location) and
          // the regions (mapFeatures).
          return <StopMapDocumentInput {...(props as ObjectInputProps)} />
        }
        if (isType('location', props.schemaType)) {
          // Inside a stop the location field hosts the combined map; elsewhere
          // (travel, start/end location) the plain pin editor.
          return (
            <LocationFieldInput
              {...(props as ObjectInputProps)}
              apiKey={config.googlePlacesApiKey}
            />
          )
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
